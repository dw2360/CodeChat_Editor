// <details>
//     <summary>License</summary>
//     <p>Copyright (C) 2022 Bryan A. Jones.</p>
//     <p>This file is part of the CodeChat Editor.</p>
//     <p>The CodeChat Editor is free software: you can redistribute it and/or
//         modify it under the terms of the GNU General Public License as
//         published by the Free Software Foundation, either version 3 of the
//         License, or (at your option) any later version.</p>
//     <p>The CodeChat Editor is distributed in the hope that it will be useful,
//         but WITHOUT ANY WARRANTY; without even the implied warranty of
//         MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
//         General Public License for more details.</p>
//     <p>You should have received a copy of the GNU General Public License
//         along with the CodeChat Editor. If not, see <a
//             href="http://www.gnu.org/licenses/">http://www.gnu.org/licenses/</a>.
//     </p>
// </details>
// <h1><code>CodeChatEditor.js</code> &mdash; <strong>JavaScrip</strong>t which
//     implements the client-side portion of the CodeChat Editor</h1>
// <p>The CodeChat Editor provides a simple IDE which allows editing of mixed
//     code and doc blocks.</p>
"use strict";

import { ace, on_dom_content_loaded } from "./CodeChat-editor.mjs";
import { html_beautify } from "js-beautify";

// <p>Emulate an enum. <a
//         href="https://www.30secondsofcode.org/articles/s/javascript-enum">This</a>
//     seems like a simple-enough approach; see also <a
//         href="https://masteringjs.io/tutorials/fundamentals/enum">JavaScript
//         Enums</a> for other options.</p>
const EditorMode = Object.freeze({
    // <p>Display the source code using CodeChat, but disallow editing.</p>
    view: 0,
    // <p>For this source, the same a view; the server uses this to avoid
    //     recursive iframes of the table of contents.</p>
    toc: 1,
    // <p>The full CodeChat editor.</p>
    edit: 2,
    // <p>Show only raw source code; ignore doc blocks, treating them also as
    //     code.</p>
    raw: 3,
});

// <p>Load code when the DOM is ready.</p>
export const page_init = (all_source) => {
    // <p>Get the mode from the page's query parameters. Default to edit using
    //     the <a
    //         href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_operator">nullish
    //         coalescing operator</a>.</p>
    const urlParams = new URLSearchParams(window.location.search);
    const editorMode = EditorMode[urlParams.get("mode")] ?? EditorMode.edit;
    on_dom_content_loaded(() => open_lp(all_source, editorMode));
};

// <p>This code instantiates editors/viewers for code and doc blocks.</p>
const make_editors = (
    // <p>A instance of the <code>EditorMode</code> enum.</p>
    editorMode
) => {
    // <p>In view mode, don't use TinyMCE, since we already have HTML. Raw mode
    //     doesn't use TinyMCE at all, or even render doc blocks as HTML.</p>
    if (editorMode === EditorMode.edit) {
        // <p>Instantiate the TinyMCE editor for doc blocks.</p>
        tinymce.init({
            // <p>Enable the <a
            //         href="https://www.tiny.cloud/docs/tinymce/6/spelling/#browser_spellcheck">browser-supplied
            //         spellchecker</a>, since TinyMCE's spellchecker is a
            //     premium feature.</p>
            browser_spellcheck: true,
            // <p>Put more buttons on the <a
            //         href="https://www.tiny.cloud/docs/tinymce/6/quickbars/">quick
            //         toolbar</a> that appears when text is selected. TODO: add
            //     a button for code format (can't find this one -- it's only on
            //     the <a
            //         href="https://www.tiny.cloud/docs/tinymce/6/available-menu-items/#the-core-menu-items">list
            //         of menu items</a> as <code>codeformat</code>).</p>
            quickbars_selection_toolbar:
                "align | bold italic underline | quicklink h2 h3 blockquote",
            // <p>Place the Tiny MCE menu bar at the top of the screen;
            //     otherwise, it floats in front of text, sometimes obscuring
            //     what the user wants to edit. See the <a
            //         href="https://www.tiny.cloud/docs/configure/editor-appearance/#fixed_toolbar_container">docs</a>.
            // </p>
            fixed_toolbar_container: "#CodeChat-menu",
            inline: true,
            // <p>See the list of <a
            //         href="https://www.tiny.cloud/docs/tinymce/6/plugins/">plugins</a>.
            // </p>
            plugins:
                "advlist anchor charmap directionality emoticons help image link lists media nonbreaking pagebreak quickbars searchreplace table visualblocks visualchars",
            // <p>When true, this still prevents hyperlinks to anchors on the
            //     current page from working correctly. There's an onClick
            //     handler that prevents links in the current page from working
            //     -- need to look into this. See also <a
            //         href="https://github.com/tinymce/tinymce/issues/3836">a
            //         related GitHub issue</a>.</p>
            //readonly: true,
            relative_urls: true,
            selector: ".CodeChat-TinyMCE",
            // <p>This combines the <a
            //         href="https://www.tiny.cloud/blog/tinymce-toolbar/">default
            //         TinyMCE toolbar buttons</a> with a few more from plugins.
            //     I like the default, so this is currently disabled.</p>
            //toolbar: 'undo redo | styleselect | bold italic | alignleft aligncenter alignright alignjustify | outdent indent | numlist bullist | ltr rtl | help',

            // <h3>Settings for plugins</h3>
            // <h4><a
            //         href="https://www.tiny.cloud/docs/plugins/opensource/image/">Image</a>
            // </h4>
            image_caption: true,
            image_advtab: true,
            image_title: true,
            // <p>Needed to allow custom elements.</p>
            extended_valid_elements:
                "graphviz-graph[graph|scale],graphviz-script-editor[value|tab],graphviz-combined[graph|scale]",
            custom_elements:
                "graphviz-graph,graphviz-script-editor,graphviz-combined",
        });
    }

    // <p>The CodeChat Document Editor doesn't include ACE.</p>
    if (ace !== undefined) {
        // <p>Instantiate the Ace editor for code blocks.</p>
        ace.config.set(
            "basePath",
            "https://cdnjs.cloudflare.com/ajax/libs/ace/1.9.5"
        );
        for (const ace_tag of document.querySelectorAll(".CodeChat-ACE")) {
            ace.edit(ace_tag, {
                // <p>The leading <code>+</code> converts the line number from a
                //     string (since all HTML attributes are strings) to a
                //     number.</p>
                firstLineNumber: +ace_tag.getAttribute(
                    "data-CodeChat-firstLineNumber"
                ),
                // <p>This is distracting, since it highlights one line for each
                //     ACE editor instance on the screen. Better: only show this
                //     if the editor has focus.</p>
                highlightActiveLine: false,
                highlightGutterLine: false,
                maxLines: 1e10,
                mode: `ace/mode/${current_metadata["mode"]}`,
                // <p>TODO: this still allows cursor movement. Need something
                //     that doesn't show an edit cursor / can't be selected;
                //     arrow keys should scroll the display, not move the cursor
                //     around in the editor.</p>
                readOnly:
                    editorMode === EditorMode.view ||
                    editorMode == EditorMode.toc,
                showPrintMargin: false,
                theme: "ace/theme/textmate",
                wrap: true,
            });
        }
    }

    // <p>Set up for editing the indent of doc blocks.</p>
    for (const td of document.querySelectorAll(".CodeChat-doc-indent")) {
        td.addEventListener("beforeinput", doc_block_indent_on_before_input);
    }
};

// <p>Store the lexer info for the currently-loaded language.</p>
let current_metadata;

// <p>True if this is a CodeChat Editor document (not a source file).</p>
const is_doc_only = () => {
    return current_metadata["mode"] === "codechat-html";
};

// <h3>Doc block indent editor</h3>
// <p>Allow only spaces and delete/backspaces when editing the indent of a doc
//     block.</p>
const doc_block_indent_on_before_input = (event) => {
    // <p>Only modify the behavior of inserts.</p>
    if (event.data) {
        // <p>Block any insert that's not an insert of spaces. TODO: need to
        //     support tabs.</p>
        if (event.data !== " ".repeat(event.data.length)) {
            event.preventDefault();
        }
    }
};

const open_lp = (all_source, editorMode) => {
    current_metadata = all_source["metadata"];
    const code_doc_block_arr = all_source["code_doc_block_arr"];
    // <p>Special case: a CodeChat Editor document's HTML doesn't need lexing.
    // </p>
    let html;
    if (is_doc_only()) {
        html = `<div class="CodeChat-TinyMCE">${code_doc_block_arr[0][2]}</div>`;
    } else {
        html = classified_source_to_html(code_doc_block_arr);
    }

    document.getElementById("CodeChat-body").innerHTML = html;
    // <p>Initialize editors for this new content.</p>
    make_editors(editorMode);
};

// <p>Save CodeChat Editor contents.</p>
export const on_save = async () => {
    // <p>Pick an inline comment from the current lexer. TODO: support block
    //     comments (CSS, for example, doesn't allow inline comment).</p>
    // <p>This is the data to write &mdash; the source code.</p>
    const source_code = editor_to_code_doc_blocks();
    await save({
        metadata: current_metadata,
        code_doc_block_arr: source_code,
    });
};

// <p>Per <a
//         href="https://developer.mozilla.org/en-US/docs/Web/API/Navigator/platform#examples">MDN</a>,
//     here's the least bad way to choose between the control key and the
//     command key.</p>
const os_is_osx =
    navigator.platform.indexOf("Mac") === 0 || navigator.platform === "iPhone"
        ? true
        : false;

// <p>Provide a shortcut of ctrl-s (or command-s) to save the current file.</p>
export const on_keydown = (event) => {
    if (
        event.key === "s" &&
        ((event.ctrlKey && !os_is_osx) || (event.metaKey && os_is_osx)) &&
        !event.altKey
    ) {
        on_save();
        event.preventDefault();
    }
};

// <p><a id="save"></a>Save the provided contents back to the filesystem, by
//     sending a <code>PUT</code> request to the server. See the <a
//         href="CodeChatEditorServer.v.html#save_file">save_file endpoint</a>.
// </p>
const save = async (contents) => {
    let response;
    try {
        response = await window.fetch(window.location, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(contents),
        });
    } catch (error) {
        window.alert(`Save failed -- ${error}.`);
        return;
    }
    if (response.ok) {
        const response_body = await response.json();
        if (response_body.success !== true) {
            window.alert("Save failed.");
        }
        return;
    }
    window.alert(
        `Save failed -- server returned ${response.status}, ${response.statusText}.`
    );
};

// <h2 id="classified_source_to_html">Convert lexed code into HTML</h2>
const classified_source_to_html = (classified_source) => {
    // <p>An array of strings for the new content of the current HTML page.</p>
    let html = [];

    // <p>Keep track of the current type. Begin with neither comment nor code.
    // </p>
    let current_delimiter = -2;

    // <p>Keep track of the current line number.</p>
    let line = 1;

    for (let [indent, delimiter, contents] of classified_source) {
        // <p><span id="newline-movement">In a code or doc block, omit the last
        //         newline; otherwise, code blocks would show an extra newline
        //         at the end of the block. (Doc blocks ending in a
        //         <code>&lt;pre&gt;</code> tag or something similar would also
        //         have this problem). To do this, remove the newline from the
        //         end of the current line, then prepend it to the beginning of
        //         the next line.</span></p>
        const m = contents.match(/\n$/);
        if (m) {
            contents = contents.substring(0, m.index);
        }

        // <p>See if there's a change in state.</p>
        if (current_delimiter !== delimiter) {
            // <p>Exit the current state.</p>
            _exit_state(current_delimiter, html);

            // <p>Enter the new state.</p>
            if (delimiter === "") {
                // <p>Code state: emit the beginning of an ACE editor block.</p>
                html.push(
                    `
<div class="CodeChat-code">
    <div class="CodeChat-ACE" data-CodeChat-firstLineNumber="${line}">`,
                    escapeHTML(contents)
                );
            } else {
                // <p>Comment state: emit an opening indent for non-zero
                //     indents; insert a TinyMCE editor.</p>
                // <p><span id="one-row-table">Use a one-row table to lay out a
                //         doc block, so that it aligns properly with a code
                //         block.</span></p>
                // prettier-ignore
                html.push(
                    `<div class="CodeChat-doc">
    <table>
        <tbody>
            <tr>
` +
                // Spaces matching the number of digits in the ACE gutter's line number. TODO: fix this to match the number of digits of the last line of the last code block. Fix ACE to display this number of digits in all gutters. See https://stackoverflow.com/questions/56601362/manually-change-ace-line-numbers. -->
`                <td class="CodeChat-ACE-gutter-padding ace_editor">&nbsp;&nbsp;&nbsp</td>
                <td class="CodeChat-ACE-padding"></td>` +
                // This doc block's indent. TODO: allow paste, but must only allow pasting whitespace.
`                <td class="ace_editor CodeChat-doc-indent" contenteditable onpaste="return false">${indent}</td>
                <td class="CodeChat-TinyMCE-td"><div class="CodeChat-TinyMCE" data-CodeChat-comment="${delimiter}">`,
                    contents
                );
            }
        } else {
            // <p><span id="newline-prepend"><a href="#newline-movement">Newline
            //             movement</a>: prepend the newline removed from the
            //         previous line to the current line</span>.</p>
            html.push(m[0], delimiter === "" ? escapeHTML(contents) : contents);
        }

        // <p>Update the state.</p>
        current_delimiter = delimiter;
        // <p>There are an unknown number of newlines in this source string. One
        //     was removed <a href="#newline-movement">here</a>, so include that
        //     in the count.</p>
        line += 1 + (contents.match(/\n|\r\n|\r/g) || []).length;
    }

    // <p>When done, exit the last state.</p>
    _exit_state(current_delimiter, html);
    return html.join("");
};

// <h3>_exit_state</h3>
// <p>Output text produced when exiting a state. Supports <a
//         href="#_generate_web_editable"><code>_generate_web_editable</code></a>.
// </p>
const _exit_state = (
    // <p>The type (classification) of the last line.</p>
    delimiter,
    // <p>An array of string to store output in.</p>
    html
) => {
    if (delimiter === "") {
        // <p>Close the current code block.</p>
        html.push("</div>\n</div>\n");
    } else if (typeof delimiter === "string") {
        // <p>Close the current doc block without adding any trailing spaces
        //     &mdash; combining this with the next line would add indentation.
        // </p>
        //</p>
        html.push(
            `</td>
            </tr>
        </tbody>
    </table>
</div>
`
        );
    }
};

// <h2>Save editor contents to source code</h2>
// <p>This transforms the current editor contents into source code.</p>
const editor_to_code_doc_blocks = () => {
    // <p>Walk through each code and doc block, extracting its contents then
    //     placing it in <code>classified_lines</code>.</p>
    let classified_lines = [];
    for (const code_or_doc_tag of document.querySelectorAll(
        ".CodeChat-ACE, .CodeChat-TinyMCE"
    )) {
        // <p>The type of this block: <code>null</code> for code, or &gt;= 0 for
        //     doc (the value of n specifies the indent in spaces).</p>
        let indent = "";
        // The delimiter for a comment block, or an empty string for a code block.
        let delimiter = "";
        // <p>A string containing all the code/docs in this block.</p>
        let full_string;

        // <p>Get the type of this block and its contents.</p>
        if (code_or_doc_tag.classList.contains("CodeChat-ACE")) {
            full_string = ace.edit(code_or_doc_tag).getValue();
        } else if (code_or_doc_tag.classList.contains("CodeChat-TinyMCE")) {
            // <p>Get the indent from the previous table cell. For a CodeChat
            //     Editor document, there's no indent (it's just a doc block). Likewise, get the delimiter; leaving it blank for a CodeChat Editor document causes the next block of code to leave off the comment delimiter, which is what we want.
            // </p>
            if (!is_doc_only()) {
                indent =
                    code_or_doc_tag.parentElement.previousElementSibling
                        .textContent;
                // Use the pre-existing delimiter for this block if it exists; otherwise, use the default delimiter.
                delimiter =
                    code_or_doc_tag.getAttribute("data-CodeChat-comment") ??
                    null;
            }
            // <p>See <a
            //         href="https://www.tiny.cloud/docs/tinymce/6/apis/tinymce.root/#get"><code>get</code></a>
            //     and <a
            //         href="https://www.tiny.cloud/docs/tinymce/6/apis/tinymce.editor/#getContent"><code>getContent()</code></a>.
            //     Fortunately, it looks like TinyMCE assigns a unique ID if
            //     one's no provided, since it only operates on an ID instead of
            //     the element itself.</p>
            full_string = tinymce.get(code_or_doc_tag.id).getContent();
            // <p>The HTML from TinyMCE is a mess! Wrap at 80 characters,
            //     including the length of the indent and comment string.</p>
            full_string = html_beautify(full_string, {
                wrap_line_length: 80 - indent.length - delimiter.length - 1,
            });
        } else {
            console.assert(
                false,
                `Unexpected class for code or doc block ${code_or_doc_tag}.`
            );
        }

        // <p>Split the <code>full_string</code> into individual lines; each one
        //     corresponds to an element of <code>classified_lines</code>.</p>
        for (const string of full_string.split(/\r?\n/)) {
            classified_lines.push([indent, delimiter, string + "\n"]);
        }
    }

    return classified_lines;
};

// <h2>Helper functions</h2>
// <p>Given text, escape it so it formats correctly as HTML. Because the
//     solution at https://stackoverflow.com/a/48054293 transforms newlines into
//     <br>(see
//     https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/innerText),
//     it's not usable with code. Instead, this is a translation of Python's
//     <code>html.escape</code> function.</p>
const escapeHTML = (unsafeText) => {
    // <p>Must be done first!</p>
    unsafeText = unsafeText.replaceAll("&", "&amp;");
    unsafeText = unsafeText.replaceAll("<", "&lt;");
    unsafeText = unsafeText.replaceAll(">", "&gt;");
    return unsafeText;
};
