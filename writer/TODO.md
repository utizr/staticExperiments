BUGS:

no bugs :) (known)

INCOMPLETE:

- inline replace to work on multiple lines. For now it works on 1 or two lines (first,last)
- inline replace to remove same tagname node from children

TODO:

- Undo state after paste:
<https://stackoverflow.com/questions/69857400/how-to-undo-changes-made-from-script-on-contenteditable-div>
- pasting non-paragraph elements into newline should create the non-paragraph element
- convert <strong> into <b> (or the other way around?) example: <https://alpinejs.dev/>
- after pasting is done, merge neighbour inline elements
- retain selection and reselect at button click: <https://stackoverflow.com/questions/985272/selecting-text-in-an-element-akin-to-highlighting-with-your-mouse>
