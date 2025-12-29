BUGS:

- underscore within inline code will trigger italic. See example 2 below.
- remove these links `<a href="javascript:void(0)"`
- bold and italic together is not ok. Eg paste this: <https://magazin.libri.hu/fikcio/szeretnem-hinni-hogy-a-regenyem-melto-kovetoje-a-hunyadi-sorozat-hagyomanyanak/>
  A new pasing method should be created without regexp.
- wrap root inline elements into p
- list element with multiple paragraphs, so if more lines are in a list then they are probably ignored. See "Example 1" below
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

RESOURCES:

material fonts
<https://fonts.google.com/icons?selected=Material+Symbols+Outlined:close:FILL@0;wght@400;GRAD@0;opsz@24&icon.size=24&icon.color=%231f1f1f&icon.style=Outlined>

```Example 1
## 9. Alternative word orders (also correct)

Spanish lets you move the pronoun around a bit:

* **Tendría que haberme puesto a preparar algunas clases.** ✅
* **Me tendría que haber puesto a preparar algunas clases.** ✅
* **Tendría que ponerme a preparar algunas clases.**
  → 1 changes meaning slightly:
  → 2 changes meaning slightly:
```

```Example 2
`color_cell` from the first undescore to the second underscore it will be italic `color_cell`
```
