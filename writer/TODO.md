BUGS:

- after pasting clear up empty inline elements like links without text etc. Example was pasting from moly.hu
- we should escape text at converting to html
- pasting a single line into an empty list item does not work. It should convert the pasted element into a list.
  - select a list item, paste it into an empty list item (enter on another list item) will not wrap the ul into a li
- when coming from a paragraph that is completely bold, and hitting enter to create a new paragraph, pasting will not work.
- pasting at the very beginning of the editor does not work if text is below it.

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
