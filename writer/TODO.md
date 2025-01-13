BUGS:

- when coming from a paragraph that is completely bold, and hitting enter to create a new paragraph, pasting will not work.

INCOMPLETE:

- after changing style (bold/italic) put the cursor behind the element
- make link with button

TODO:

- Undo state after paste:
<https://stackoverflow.com/questions/69857400/how-to-undo-changes-made-from-script-on-contenteditable-div>
- pasting non-paragraph elements into newline should create the non-paragraph element
- convert <strong> into <b> (or the other way around?) example: <https://alpinejs.dev/>
- after pasting is done, merge neighbour inline elements
- retain selection and reselect at button click: <https://stackoverflow.com/questions/985272/selecting-text-in-an-element-akin-to-highlighting-with-your-mouse>
