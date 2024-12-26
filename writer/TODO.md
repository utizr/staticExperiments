- Undo state after paste:
<https://stackoverflow.com/questions/69857400/how-to-undo-changes-made-from-script-on-contenteditable-div>
- pasting non-paragraph elements into newline should create the non-paragraph element
- when making an empty newline from a bold/italic element, it will create e <p><b>.</b></p> (dot is just to mark the cursor)
when pasting this will no do anything. Probably it does not find the selection container.
- convert <strong> into <b> (or the other way around?) example: <https://alpinejs.dev/>
