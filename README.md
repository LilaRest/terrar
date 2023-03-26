<p align="center">
    <img width="200" src="static/logo.png" alt="Tulipe logo">
</p>

<h1 align="center">Terrar<i>.js</i></h1>
<p align="center"><b>An efficient and permeable alternative to iframes.</b></p>

<br>

<div align="center">
	<!--<img alt="GitHub Workflow Status" src="https://img.shields.io/github/actions/workflow/status/LilaRest/terrar/semantic-release.yml">-->
	<img alt="GitHub Downloads" src="https://img.shields.io/github/downloads/LilaRest/terrar/total?color=%23ddccef">
	<img alt="GitHub License" src="https://img.shields.io/github/license/LilaRest/terrar?color=%235588ff">
	<img alt="Semantic-release: angular" src="https://img.shields.io/badge/semantic--release-angular-e10079?logo=semantic-release">
</div>

<br>
<br>
<br>

## Disclaimer
**Do not use in production**. This project is a prototype, has not been audited, and has not been thoroughly tested.

Interested in using this library ? Give it a ⭐ to encourage further development.

<br>
<br>

## Introduction
**Terrar<i>.js</i>** offers HTML, CSS and JS isolations by using :
- the [SES](https://github.com/endojs/endo/tree/master/packages/ses#readme) library to create rights-less JS compartements
- the native Shadow DOM API to create HTML & CSS isolated contexts
- the [Esprima](https://github.com/jquery/esprima) library to prevent the isolated context from accessing disallowed objects (e.g., elements outside of the Shadow Root)

<br>
<br>

## Installation
In an NPM environnement, **Terrar<i>.js</i>** can be installed like any NPM package :
```bash
npm install terrar
```
You can then import the `terrar` object using :
```js
import "terrar";
```
<br>

For browser usage, simply put this `<script>` tag inside your HTML document :
```html
<script src="https://unpkg.com/terrar@latest/dist/terrar.umd.js"></script>
```
The `terrar` object will be available in the global scope.

<br>
<br>

## Usage

### From JS
To create a _Terrar Frame_ from Javascript, you can use the `createFrame()` method of the `terrar` object.

This method takes a string as parameter, which is the HTML content you want to isolate.
```js
const content = `<!-- Your isolated HTML here -->`
const frame = terrar.createFrame(content)
```

### From HTML
To create a _Terrar Frame_ from HTML, you can use the `<terrar-frame>` custom element.

This element takes a `src` attribute, which is the URL of the HTML content you want to isolate.
```html
...
<terrar-frame src="https://isolated-content.here/index.html"></terrar-frame>
...
```

Or you can also pass a content directly to it by wrapping since between `<template>` tags.
```html
...
<terrar-frame>
  <template>
    <!-- Your isolated HTML here -->
  </template>
</terrar-frame>
...
```
Note that :
- the `src` attribute has priority over the `<template>` tag
- the `<template>` tag is only used to pass content to the frame, it is not rendered in the main context
- wrapping between `<template>` and `</template>` is mandatory (else the isolated content will be executed in the main context)

<br>
<br>

## Configuration
While the default configuration should fit most use cases, you can configure each or all the _Terrar frames_ of the page to :
- allow/restrict the usage of some tags
- expose/hide functions from the main context

Currently, some work remains to make configuration fully functional. This section will not be detailed here yet.

<br>
<br>

## SSR (Server Side Rendering)
Like iframes, _Terrar Frames_ provide a client-side way to isolate content from the main context. 

As seen in the [Usage](#Usage) section, HTML content can be directly inserted in the HTML document using the `<terrar-frame>` element.

This means that a server can pre-populate the document before serving it to client. This helps to reduce the number of requests and Javascript executionx the page has to perform.

In the future, it will also be possible to pre-process script on server-side to reduce even more computations on client-side.

<br>
<br>

## Limitations
Since **Terrar<i>.js</i>** creates SES compartement instead of a whole new Realm (a new JS context) like iframes, many external ressources may not load because of their CORS policy.

So, at the moment, *Terrar<i>.js</i>** is especially useful with :
- Contents you own but don't trust (e.g., user-provided HTML contents)
- Contents that trusts you but you don't trust (e.g. partner third-party widgets)
- Contents dynamically generated from JS that you want to prevent from colliding with each other
