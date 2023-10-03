Copyright (C) 2023 Bryan A. Jones.

This file is part of the CodeChat Editor.

The CodeChat Editor is free software: you can redistribute it and/or modify it
under the terms of the GNU General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version.

The CodeChat Editor is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
details.

You should have received a copy of the GNU General Public License along with
the CodeChat Editor. If not, see
[http://www.gnu.org/licenses/](http://www.gnu.org/licenses/).

# Implementation

## <a id="an-implementation"></a>Architecture

### Client/server partitioning

Doc blocks consist of Markdown augmented with custom HTML elements which
provide authoring support. Some of these elements depend only on information in
the current page. For example, a GraphViz graph tag transforms the graph
provided in its tag into an SVG; it doesn't need information from other files.
Other elements, such as a cross-reference tag, depend on information from other
pages (in this case, the page containing the referenced item). The client lacks
the ability to access other files, while the server has direct access to these
files. Therefore, the overall strategy is:

- On page load, the server transforms custom tags which depend on information
  from other pages into tags which include this information. For example, a
  cross-reference tag might be transformed into a hyperlink whose link text
  comes from the cross-reference on another page.
- The client them defines a set of
  [Web Components](https://developer.mozilla.org/en-US/docs/Web/Web_Components)
  which implement custom tags which only need local information. For example, a
  GraphViz custom tag renders graphs based on a description of the graph inside
  the tag.
- On save, the client sends its text back to the server, which de-transforms
  custom tags which depend on information from other pages. If de-transforms
  disagree with the provided text, then re-load the updated text after the save
  is complete. For example, after inserting an auto-titled link, the
  auto-titled text is missing; a save/reload fixes this.

### Page processing pipeline

On load:

- Classify the file; input are mutable global state (which, if present,
  indicates this is a project build), if the file is a TOC, the file's binary
  data, and the file's path. Output of the classification: binary, raw text, a
  CodeChat document (a Markdown file), or a CodeChat file. The load processing
  pipelines For CodeChat files:
- (CodeChat files only) Run pre-parse hooks: they receive source code, file
  metadata. Examples: code formatters. Skip if cache is up to date.
- (CodeChat files only) Lex the file into code and doc blocks.
- Run post-parse hooks: they receive an array of code and doc blocks.
  - Transform Markdown to HTML.
- Run HTML hooks:
  - Update the cache for the current file only if the current file's cache is
    stale. To do this, walk the DOM of each doc block. The hook specifies which
    tags it wants, and the tree walker calls the hook when it encounters these.
    If this requires adding/changing anything (anchors, for example), mark the
    document as dirty.
  - Update tags whose contents depend on data from other files. Hooks work the
    same as the cache updates, but have a different role. They're always run,
    while the cache update is skipped when the cache is current.
- Determine next/prev/up hyperlinks based on this file's location in the TOC.
- Transform the code and doc blocks into CodeMirror's format.

We want a clean separate between the webserver and the processing pipeline. The
webserver should provide I/O between the local file system and the client, but
do little processing. The processing pipeline should not perform I/O.
Therefore:

- On load, the webserver receives a request for a file. It should gather and
  pass the following to the page processor:
  - The loaded file as text (or an Err result).
  - The global state (empty if this isn't a project build).
  - The pathname of the file.
  - If this file should be processed as a TOC or not.
- The page processor returns:
  - An Enum with the file's contents: a

On save:

- Transform the CodeMirror format back to code and doc blocks.
- Run HTML hooks:
  - Update the cache for the current file. Mark the file as "dirty" (reload
    needed) if any changes are made.
  - Check tags whose contents depend on data from other files; if the contents
    differ, mark the file as dirty.
  - Transform HTML to Markdown.
- Run post-parse hooks; mark the file as dirty if any changes are made.
- De-lex the file into source code.
- Run pre-parse hooks; mark the file as dirty if any changes are made.
- Save the file to disk.
- If dirty, re-load the file.

### Table of contents

- While the TOC file must be placed in the root of the project, it will be
  served alongside pages served from subdirectories. Therefore, place this in
  an iframe to avoid regenerating it for every page.
- The TOC is just HTML. Numbered sections are expressed as nested ordered
  lists, with links to each section inside these lists.
- All numbering is stored internally as a number, instead of the corresponding
  marker (I, II, III, etc.). This allows styles to customize numbering easily.
  - Given an `a` element in the TOC, looking through its parents provides the
    section number. Given an array of section numbers, use CSS to style all the
    headings. Implement numbering using CSS variables, which makes it easy for
    a style sheet to include or exclude section numbers:

    `:root {`\
      `--section-counter-reset: s1 4 s2 5;`\
     
    `--section-counter-content: counter(s1, numeric) '-' counter(s2, numeric);`\
    `}`

    `h1::before {`\
      `counter-reset: var(--section-counter-reset);`\
      `content: var(--section-counter-content);`\
    `}`

### Cached state

When hydrating a page (transforming all custom tags into standard HTML) on the
server, all needed hydration data should be stored in the cache.

#### Data and format

What we need to know:

- To generate the TOC, we need a way to find the linked file, then get a list
  of all its headings.
  - Problem: files can be moved. Better would be an invariant anchor, stored in
    the file, which doesn't change. It would make sense to link to the only
    \<h1> element...but there may not be one, or it may not be at the top of
    the file. The easy solution would be an anchor tag at the beginning of the
    file...but this would break shell scripts, for example. Another is
    including an anchor tag somewhere in each document, but need authors to
    understand what it is (and not delete it). Another possibility is to link
    to any anchor in the file with a special query identifying it as link to
    the underlying file.
- To auto-title a link, need to look up an anchor and get its location (page
  number, section number) and title.
- For back links, need to look up all links to the given anchor, then get the
  location and title of each link.
- To generate the TOC containing all anchors, we need a list of all anchors on
  a given page.

Therefore, the cache must contain:

- For each file, stored as the relative path from the project's root directory
  to that file:
  - A time/date stamp to determine if this cached data is stale or not.
  - The global TOC numbering.
  - A nested list of headings, represented by their anchor (supporting TOC
    generation). For each heading, also provide a list of all non-heading
    anchors it contains (supporting all anchors TOC generation).
- For each anchor (including anything linkable -- images, videos, etc.):
  - The page it's in, as a path to the file containing this page. This allows
    references to look up the page numbering for this anchor.
  - The outer HTML of the item it refers to (self/sibling/etc.), for use with
    references.
  - Its numbering within the current page, also for use with references.
- For each link:
  - Its anchor and the anchor it links to, to support back link generation.

#### Editing and cached state

Edits to the document of any cached items cause the browser to push this edit
to the server; the server then propagates the edits to open windows and updates
its state. If a modified file is closed without saving it (meaning the cached
state for this file is now invalid), then all that cache state must be flushed.
To flush, simply set the date/time stamp of that file to something old/invalid.

### TOC custom tag

Options:

- Path to linked file
- Depth of numbering

#### Example

<div class="CodeChat-toc mceNonEditable" data-codechat-path="static/css/CodeChatEditor.css" data-codechat-depth=""><p>asdf</p></div>

### Numbering

On a page, the local TOC numbering comes only from heading tags. The CSS (which
would adding numbering to selected headings) must be kept in sync with the code
which infers the numbering. A simple value (4, meaning h1-h4 are numbered) is
all the code needs. How to do this?

On the TOC, numbering may come from both heading tags and ordered lists, again
based on the CSS. Numbered headings should be included in the numbering,
followed by ordered list numbering.

### Settings

The settings should be configurable from a nice GUI. I like the VSCode idea --
make it easy to add more config values. Settings should also be available for
plug-ins. Store the config values in a bare JSON file; provide a web-based GUI
with descriptions of each setting.

- Files/directories to process/ignore
- Header/footer info (name, version, copyright, etc.)
- The programming language, markup language, and spellchecker language for each
  source file.
- Text wrap width when saving.
- Visual styling (theme/style sheets, color, fonts, size of TOC sidebar,
  location of sidebar, etc.).
- HTML `<head>` modifications: CSS/JS to add to all pages/a set of pages.
- Depth of headings to include in the page-local TOC.
- Auto-reload if modified externally or not
- Tabs vs spaces; newline type
- Substitutions

### <a id="core-developmnt-priorities"></a>Core development priorities

1.  IDE integration
2.  Editor functionality

### <a id="next-steps"></a>Next steps

1.  Refactor the webserver to pull out the processing step (converting source
    code to code/doc blocks). Run this in a separate thread -- see the
    [Tokio docs](https://docs.rs/tokio/latest/tokio/#cpu-bound-tasks-and-blocking-code)
    on how to await a task running in another thread.
2.  Implement caching for all anchors/headings.
3.  Implement author support: TOC, auto-titled links.
4.  Implement a good GUI for inserting hyperlinks.
5.  Better support for template literals.
6.  Decide how to handle nested block comments.
7.  Define the architecture for IDE extensions/plug-ins. Goal: minimize
    extension/plug-in complexity.
8.  Define desired UI behavior. Priority: auto-reload; dirty document
    detection; auto-backup.
9.  Propose visual styling, dark mode, etc.

### To do

1.  Open the TOC as a single-file edit? If not, at least hide the sidebar,
    since that's redundant.

### Open questions

- I'd like to be able to wrap a heading and associated content in a `<section>`
  tag. This is hard to do -- if a heading appears in the middle of an indented
  comment, then need special processing (close the section, then the indent,
  then restart a new indent and section). In addition, it requires that code is
  nested inside doc blocks, which is tricky. However, I would like to do this.
- How to handle images/videos/PDFs/etc. when file are moved? Currently, we
  expect the user to move them as well. There's not an easy way to tag them
  with an unique ID, then refer to them using that ID than I can think of.
- Config file format: I really like and prefer Python's strictyaml. Basically,
  I want something that includes type validation and allows comments within the
  config file. Perhaps JSON with a pre-parse step to discard comments then
  [JSON Typedef](https://jsontypedef.com/)? Possibly, vlang can do this
  somewhat, since it wants to decode JSON into a V struct.)

## Organization

### Client

As shown in the figure below, the CodeChat Editor client starts with
`client/webpack/package.json`, which tells
[NPM](<https://en.wikipedia.org/wiki/Npm_(software)>) which JavaScript
libraries are used in this project. Running `npm update` copies these libraries
and all their dependencies to the `client/webpack/node_modules` directory. The
CodeChat Editor client source code (see
[CodeChat-editor.mts](../client/webpack/CodeChat-editor.mts)) imports these
libraries.

Next, [esbuild](https://esbuild.github.io/) analyzes the CodeChat Editor client
based by transforming any [TypeScript](https://www.typescriptlang.org/) into
JavaScript then packaging all dependencies (JavaScript, CSS, images, etc.) into
a smaller set of files. At a user's request, the CodeChat Editor server
generates HTML which creates an editor around the user-requested file. This
HTML loads the packaged dependencies to create the CodeChat Editor webpage.

<graphviz-graph graph="digraph {&#10;    JS_lib [label = &quot;JavaScript libraries&quot;];&#10;    &quot;package.json&quot; -> JS_lib [label = &quot;npm update&quot;];&#10;    JS_lib -> esbuild;&#10;    CCE_source [label = &quot;CodeChat Editor\nclient-side source&quot;];&#10;    JS_lib -> CCE_source [label = &quot;imports&quot;];&#10;    CCE_source -> esbuild;&#10;    esbuild -> &quot;Packaged JavaScript&quot;;&#10;    CCE_webpage [label = &quot;CodeChat Editor\nwebpage&quot;];&#10;    &quot;Packaged JavaScript&quot; -> CCE_webpage;&#10;    server_HTML [label = &quot;CodeChat Editor\nserver-generated\nHTML&quot;];&#10;    server_HTML -> CCE_webpage;&#10;}"></graphviz-graph>

However, esbuild's code splitting doesn't work with dynamic imports -- the
splitter always picks Node-style default imports, while the Ace editor expects
Babel-style imports.

TODO: GUIs using TinyMCE. See the
[how-to guide](https://www.tiny.cloud/docs/tinymce/6/dialog-components/#panel-components).

### System architecture

<graphviz-graph graph="digraph {&#10;    bgcolor = transparent;&#10;    compound = true;&#10;    node [shape = box];&#10;    subgraph cluster_text_editor {&#10;        label = &quot;Text editor/IDE&quot;;&#10;        source_code [label = &quot;Source\ncode&quot;, style = dashed];&#10;        CodeChat_plugin [label = &quot;CodeChat\nEditor plugin&quot;];&#10;    }&#10;    subgraph cluster_server {&#10;        label = <CodeChat Editor Server>;&#10;        websocket_server [label = &quot;Websocket\nserver&quot;];&#10;        web_server [label = &quot;Web\nserver&quot;];&#10;    }&#10;    subgraph cluster_client {&#10;        label = &quot;CodeChat Editor Client&quot;;&#10;        rendered_code [label = &quot;Rendered code&quot;, style = dashed];&#10;        JavaScript;&#10;    }&#10;    CodeChat_plugin -> websocket_server [dir = both];&#10;    websocket_server -> JavaScript [dir = both];&#10;    web_server -> JavaScript [label = &quot;HTTP&quot;, dir = both, lhead = cluster_client];&#10;}"></graphviz-graph>

## Code style

JavaScript functions are a
[disaster](https://dmitripavlutin.com/differences-between-arrow-and-regular-functions/).
Therefore, we use only arrow functions for this codebase.

Other than that, follow the
[MDN style guide](https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Writing_style_guide/Code_style_guide/JavaScript).