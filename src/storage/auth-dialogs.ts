// Create a generic authentication modal for GitHub tokens
export function showGistAuthDialog(): Promise<string | null> {
  return new Promise((resolve) => {
    // Create modal element
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';

    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.maxWidth = '500px';

    // Add close button
    const closeButton = document.createElement('span');
    closeButton.className = 'close';
    closeButton.innerHTML = '&times;';
    closeButton.onclick = () => {
      document.body.removeChild(modal);
      resolve(null);
    };

    // Add title
    const title = document.createElement('h2');
    title.textContent = 'GitHub Token Required';

    // Add instructions
    const instructions = document.createElement('div');
    instructions.innerHTML = `
      <ol>
        <li>Go to <a href="https://github.com/settings/tokens" target="_blank">GitHub Personal Access Tokens</a></li>
        <li>Click "Generate new token" and select "Generate new token (classic)"</li>
        <li>Give it a name like "fnCAD Gist Access"</li>
        <li>Select only the "gist" scope</li>
        <li>Click "Generate token" at the bottom</li>
        <li>Copy the token and paste it below</li>
      </ol>
    `;

    // Add token input
    const inputGroup = document.createElement('div');
    inputGroup.style.marginBottom = '20px';

    const inputLabel = document.createElement('label');
    inputLabel.textContent = 'GitHub Personal Access Token:';
    inputLabel.style.display = 'block';
    inputLabel.style.marginBottom = '5px';

    const tokenInput = document.createElement('input');
    tokenInput.type = 'text';
    tokenInput.placeholder = 'ghp_...';
    tokenInput.style.width = '100%';
    tokenInput.style.padding = '8px';
    tokenInput.style.marginBottom = '10px';

    inputGroup.appendChild(inputLabel);
    inputGroup.appendChild(tokenInput);

    // Add save button
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save Token';
    saveButton.onclick = () => {
      const token = tokenInput.value.trim();
      if (token) {
        document.body.removeChild(modal);
        resolve(token);
      } else {
        alert('Please enter a valid token');
      }
    };

    // Add cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.marginLeft = '10px';
    cancelButton.style.backgroundColor = '#f44336';
    cancelButton.onclick = () => {
      document.body.removeChild(modal);
      resolve(null);
    };

    // Buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.appendChild(saveButton);
    buttonsContainer.appendChild(cancelButton);

    // Assemble modal
    modalContent.appendChild(closeButton);
    modalContent.appendChild(title);
    modalContent.appendChild(instructions);
    modalContent.appendChild(inputGroup);
    modalContent.appendChild(buttonsContainer);

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // Focus token input
    setTimeout(() => {
      tokenInput.focus();
    }, 100);

    // Handle Enter key
    tokenInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveButton.click();
      }
    });

    // Close when clicking outside
    window.onclick = (event) => {
      if (event.target === modal) {
        document.body.removeChild(modal);
        resolve(null);
      }
    };
  });
}
