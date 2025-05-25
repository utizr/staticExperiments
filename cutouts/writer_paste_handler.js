else if (logic === mergeLogic && elements.length > 0 && lines.length > 1) {
    // if we are inserting to the middle of a paragraph
    // and we are inserting more lines.
    // In this case we are creating a new paragraph from the extracted first part
    // of the paragraph, and attach the first line; we then insert the middle lines
    // as new paragraphs. Then at the end we create a new paragraph from the extracted
    // last part of the paragraph, and attach the last line to it.
    const firstBlockNode = elements.shift();
    const lastBlockNode = elements.pop() || firstBlockNode;
    const startRange = range.cloneRange();
    const endRange = range.cloneRange();

    let firstHtmlNodePasted = htmlPasted.firstChild;
    let lastHtmlNodePasted = htmlPasted.lastChild;

    if (htmlPasted.firstChild.tagName === 'UL') {
      firstHtmlNodePasted = htmlPasted.firstChild.firstChild;
    }
    if (htmlPasted.lastChild.tagName === 'UL') {
      lastHtmlNodePasted = htmlPasted.lastChild.lastChild;
    }

    // if we select the complete paragraph (block element) in firefox all children are removed
    // so we have to add a dummy one.
    if (!firstBlockNode.firstChild) {
      const dummyTextNode = document.createTextNode("");
      firstBlockNode.append(dummyTextNode);
    }
    startRange.setStartBefore(firstBlockNode.firstChild);
    // this is needed because if the end of the selection is not 
    // in the starting container it will encapsulate the complete block element.
    // so if we have paragraphs, instead of getting a text node, we'd get the paragraph element
    startRange.setEndAfter(firstBlockNode.lastChild);
    endRange.setEndAfter(lastBlockNode.lastChild);
    endRange.setStartBefore(lastBlockNode.firstChild);
    const startContent = startRange.extractContents();
    const endContent = endRange.extractContents();


    // we are adding the content before the selection from the first block element
    // to the beginning of the first pasted node.
    const tempDiv = document.createElement('div');
    while (firstHtmlNodePasted.firstChild) {
      tempDiv.append(firstHtmlNodePasted.firstChild);
    }
    if (!!startContent.textContent) {
      while (startContent.firstChild) {
        firstHtmlNodePasted.append(startContent.firstChild);
      }
    }
    while (tempDiv.firstChild) {
      firstHtmlNodePasted.append(tempDiv.firstChild);
    }
    firstHtmlNodePasted.normalize();

    tempDiv.remove();

    let endNode = firstBlockNode;
    while (htmlPasted.firstChild) {
      if (htmlPasted.firstChild.nodeType == textNodeType) {
        htmlPasted.firstChild.remove();
        continue;
      }
      const elem = htmlPasted.firstChild.cloneNode(true);
      htmlPasted.firstChild.remove();
      endNode.after(elem);
      endNode = elem;
      endNode.normalize();
    }

    if (endNode.tagName === 'UL') {
      endNode = endNode.lastChild;
    }
    endTextNode = lastTextNodeOf(endNode);

    if (!!endContent.textContent) {
      while (endContent.firstChild) {
        endNode.append(endContent.firstChild);
      }
    }
    endNode.normalize();

    range.collapse(false);

    carretToTextNodeEnd(sel, endTextNode);
    firstBlockNode.remove();
    if (firstBlockNode != lastBlockNode) {
      lastBlockNode.remove();
    }
  }