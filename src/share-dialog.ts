export function showShareDialog(url: string, filename: string) {
  // Create modal element
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'block';
  modal.id = 'share-modal';

  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';
  modalContent.style.maxWidth = '500px'; // Make it narrower
  modalContent.style.margin = '10% auto'; // Better vertical centering

  // Add close button
  const closeButton = document.createElement('span');
  closeButton.className = 'close';
  closeButton.innerHTML = '&times;';
  closeButton.onclick = () => {
    document.body.removeChild(modal);
  };

  // Add title
  const title = document.createElement('h2');
  title.style.margin = '0';
  title.style.display = 'inline-block';
  title.style.marginRight = '20px';
  title.textContent = 'Share Your Model';

  // Add filename
  const filenameElem = document.createElement('p');
  filenameElem.textContent = `File: ${filename}`;

  // Add share URL input
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.value = url;
  urlInput.readOnly = true;
  urlInput.style.width = '100%';
  urlInput.style.padding = '8px';
  urlInput.style.marginBottom = '10px';
  urlInput.style.boxSizing = 'border-box'; // Prevent overflow
  urlInput.onclick = () => {
    urlInput.select();
  };

  // Add copy button
  const copyButton = document.createElement('button');
  copyButton.textContent = 'Copy Link';
  copyButton.onclick = () => {
    urlInput.select();
    document.execCommand('copy');
    const originalText = copyButton.textContent;
    copyButton.textContent = 'Copied!';
    setTimeout(() => {
      copyButton.textContent = originalText;
    }, 2000);
  };

  // Assemble modal
  modalContent.appendChild(closeButton);
  modalContent.appendChild(title);
  modalContent.appendChild(filenameElem);
  modalContent.appendChild(document.createElement('br'));
  modalContent.appendChild(urlInput);
  modalContent.appendChild(copyButton);

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Select the URL for easy copying
  setTimeout(() => {
    urlInput.select();
  }, 100);

  // Close when clicking outside
  window.onclick = (event) => {
    if (event.target === modal) {
      document.body.removeChild(modal);
    }
  };
}
