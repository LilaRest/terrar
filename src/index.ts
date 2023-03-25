/*
HTML & CSS isolations: OK
JS isolations:
  - [ ] Sanitize or retrieve inline scripts
*/
import "ses";
import * as esprima from 'esprima';
import * as escodegen from 'escodegen';
import * as estraverse from 'estraverse';
import * as utils from "./utils";
import * as config from "./config";
import { Node } from 'estree';


// Ensure the page is using UTF-8 (SES library requirement)
// See: https:;//github.com/endojs/endo/tree/master/packages/ses#usage
if (document.characterSet !== "UTF-8") throw new Error("[Terrar.js] ERROR: The library won't load in non-UTF-8 environments. Current encoding: " + document.characterSet);

// Tamper-proofs realm's intrinsics, freeze some shared objects. 
// See: https://github.com/endojs/endo/tree/master/packages/ses#lockdown
lockdown({
  errorTrapping: "none" // To investigate https://github.com/endojs/endo/blob/master/packages/ses/docs/lockdown.md#errortrapping-options (maybe to only enable in dev environment)
});

// Cache global object values in a Set for later usage
const globalValues = new Set();
for (const property in window) {
  globalValues.add(window[property]);
}


class TerrarFrame extends HTMLElement {
  allowedTags: string[];
  _content: string;
  _endowments: any;
  _onRenderedCallbacks: Function[];
  frameDocument: ShadowRoot | null;

  constructor (
    content: string = "",
    allowedTags: string[] = [],
    endowments: string | Object = "strict"
  ) {
    super();
    this.allowedTags = utils.concatDistinct(allowedTags, config.defaultAllowedTags);
    this._content = content;
    this._endowments = endowments;
    this._onRenderedCallbacks = [];
    this.frameDocument = null;

    // Initialize the Terrar Frame
    if (document.readyState === "complete") this.init();
    window.addEventListener("load", this.init.bind(this));
  }

  /** 
   * This method initializes the Terrar Frame asynchronously.
   */
  async init () {

    // Append the inline allowed tags (from HTML attribute) to the allowedTags Array
    const inlineAllowedTags = this.getAttribute("allowed-tags");
    if (inlineAllowedTags) {
      const tagsArray = inlineAllowedTags
        .replaceAll(" ", "")
        .trim()
        .split(",");
      this.allowedTags = utils.concatDistinct(this.allowedTags, tagsArray);
    }

    // Retrieve the HTML content to be rendered in the isolated frame.
    this._content = this._content ? this._content : "";
    if (!this._content && this.firstElementChild) {

      // Ensure the first element of the TerrarFrame is a template
      // Else it means that any script contained in the TerrarFrame
      // will be executed on page load.
      if (this.firstElementChild !== this.lastElementChild || this.firstElementChild.nodeName !== "TEMPLATE") throw new Error("[Terrar.js] CRITICAL SECURITY RISK: The whole content of this Terrar Frame is not wrapped inside of a <template> element.");
      this._content = this.firstElementChild.innerHTML;
    }

    // Don't continue rendering the Terrar Frame if content is empty
    if (this._content.trim() === "") throw new Error("[Terrar.js] ERROR: This Terrar Frame is empty, it will not be rendered.");

    // Extract and remove scripts from content
    let scripts;
    [this._content, scripts] = await this.extractScripts(this._content);

    // Empty the Terrar Frame element (in case the content has been filled from HTML)
    this.innerHTML = "";

    // Attach a Shadow DOM to the terrar-frame element
    this.frameDocument = this.attachShadow({ mode: 'open' });

    // Bind the frameDocument to all its methods to prevent accessing other objects from it
    // NOTE: This need more works as it maybe not match behavior of the real document object
    // may cause issues and may be unnecessary.
    for (const prop in this.frameDocument) {
      const value = (<any>this.frameDocument)[prop];
      if (typeof value === "function") {
        (<any>this.frameDocument)[prop] = value.bind(this.frameDocument);
      }
    }

    // And populate the frame content in it
    this.frameDocument.innerHTML = this._content;

    // Build the endowments object
    // Note: harden() is used to ensure the wrapped functions are frozen
    const strictEndowments = {
      console: {
        log: harden(console.log),
        warn: harden(console.warn),
        error: harden(console.error)
      },
      window: {
        addEventListener: harden(window.addEventListener)
      },
      _c: harden((expression: any) => {
        if (expression instanceof HTMLElement) {
          this.enforceChildren(expression);
          this.enforceAllowedTag(expression);
        }

        else if (expression === window || globalValues.has(expression)) {
          if (!Object.values(strictEndowments.window).includes(expression)) {
            throw new Error("[Terrar.js] Usage of window object and its global properties (document, etc.) is not allowed in this isolated Javascript context.");
          }
        }
        return expression;
      })
    };

    this._endowments = this._endowments === "strict" ? strictEndowments : this._endowments;
    this._endowments.document = this.frameDocument;

    // Add an extra layer that check scripts
    const safeScripts = scripts.map(script => this.makeScriptSafe(script));

    // Execute the Terrar Frame's scripts in a SES compartement
    const compartment = new Compartment(this._endowments);
    try {
      safeScripts.forEach(script => compartment.evaluate(script));
    } catch (e) {
      throw new Error("[Terrar.js] Error while executing isolated code: " + e);
    }

    // Call the onRendered callbacks
    this._onRenderedCallbacks.forEach(callback => callback());
  }

  /**
   * This method wraps the given Node in a _c() function call (the checker)
   */
  wrapInChecker = (node: Node) => {
    return {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: '_c',
      },
      arguments: [node],
    };
  };

  /**
   * This method parses a given JS code string and wraps any object reference in a _c() function call (the checker)
   * @param code The code to wrap (string)
   * @returns The modified code string
   */
  makeScriptSafe (code: string) {
    // Parse the code into an AST
    const ast = esprima.parseScript(code);

    // Traverse the AST and wrap any potential object reference
    estraverse.replace(ast, {
      // @ts-ignore
      enter: (node, parent) => {

        // Figure if the node is already wrapped in a _c() function
        let alreadyChecked = false;
        [node, parent].forEach(tested => {
          //@ts-ignore
          if (tested && tested.type === 'CallExpression' && tested.callee.name === '_c') alreadyChecked = true;
        });

        // If the node is not already wrapped
        if (!alreadyChecked) {

          const isLeftSideOfAssignment =
            parent && parent.type === 'AssignmentExpression' && parent.left === node;

          // Support for MemberExpression type (object properties), e.g. `a.b` in `a.b = c;` or `a.b()` in `a.b();`
          if (node.type === "MemberExpression") {
            // @ts-ignore
            node.object = this.wrapInChecker(node.object);

            const isLeftSideOfAssignment =
              parent &&
              parent.type === 'AssignmentExpression' &&
              parent.left === node;

            // Don't wrap the whole Member expression (object + property) if it's the left side of an assignment (e.g. `a.b = c;` should not be wrapped in `check(a.b) = c;`)
            if (!isLeftSideOfAssignment) {
              return this.wrapInChecker(node);
            }
          }

          /* Support for alone Identifier type, e.g. `window` in `console.log(window);`
             Note : The parent type is checked because by default Identifier selects more than alone idenfifiers, so checking for :
              - MemberExpression : Prevents rewrapping of object of MemberExpression and causing 'undefined' statements
              - VariableDeclarator : Prevent wrapping identifiers using in variable declarations, e.g. `const a = b;` should not be wrapped in `const check(a) = b;`
              - Property : Prevents wrapping of property names in object literals, e.g. `{ a: b }` should not be wrapped in `{ check(a): b }`
          */
          if (node.type === 'Identifier' &&
            !(parent && ['MemberExpression', 'Property', 'VariableDeclarator'].includes(parent.type))) {
            return this.wrapInChecker(node);
          }

          // Other types of nodes that can be wrapped entirely as is
          if (["CallExpression", "ThisExpression"].includes(node.type)) return this.wrapInChecker(node);
        }
      },
    });

    // Generate the transformed JavaScript code from the AST
    return escodegen.generate(ast);
  }

  /**
   * This method text an HTML string and extract scripts from it,
   * which are returned in a separate array.
   * @param content An HTML content string
   * @returns An version of the given content without scripts
   * @returns An array of extract scripts strings
   */
  async extractScripts (content: string): Promise<[string, string[]]> {
    const template = document.createElement("template");
    template.innerHTML = content;

    // Retrieve Javascript programs
    const scripts = [];
    const scriptEls = template.content.querySelectorAll("script");
    for (const scriptEl of scriptEls) {
      if (scriptEl.src) {
        const response = await fetch(scriptEl.src);
        scripts.push(await response.text());
      }
      else if (scriptEl.innerText.trim()) {
        scripts.push(scriptEl.innerText);
      }
      scriptEl.remove(); // TODO: Find another way to disable the script execution while keeping it visible in the Shadow DOM. Else users could think that the script is missing and not executed by looking at DOM.
    };

    return [template.innerHTML, scripts];
  };

  /**
   * This method ensures that the given element is allowed to be used, 
   * else it throws an error.
   * @param prop An HTMLElement
   */
  enforceAllowedTag (element: HTMLElement | ShadowRoot) {
    if (element !== this.frameDocument && !(element instanceof ShadowRoot)) {
      const elName = element.tagName.toLowerCase();
      if (!this.allowedTags.includes(elName)) {
        throw new Error(`[Terrar.js] Usage of "${elName}" elements is not allowed in this isolated Javascript context.`);
      }
    }
  }

  /**
   * This method ensures that the given element is a children of the
   * Terrar Frame's document element, else it throws an error.
   * @param prop An HTMLElement
   */
  enforceChildren (element: HTMLElement | ShadowRoot) {
    if (element !== this.frameDocument) {
      if (document.body.contains(element) && !this.frameDocument!.contains(element)) {
        throw new Error(`[Terrar.js] Access to "${element}" is not allowed in this isolated Javascript context.`);
      }
    }
  }

  /**
   * This method registers a callback to be called when the Terrar Frame
   * is rendered.
   * @param callback A callback function
   */
  onRendered (callback: Function) {
    this._onRenderedCallbacks.push(callback);
  }
}

// Setup the Terrar Frame custom element (Web Component)
customElements.define("terrar-frame", TerrarFrame);

// Populate the createFrame method
export function createFrame (
  content: string,
  allowedTags: string[],
  endowments: any) {
  return new TerrarFrame(content, allowedTags, endowments);
};
