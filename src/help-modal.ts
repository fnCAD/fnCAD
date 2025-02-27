// Get modal elements
const modal = document.getElementById('help-modal') as HTMLElement;
const btn = document.getElementById('show-help') as HTMLElement;
const span = document.querySelector('.close') as HTMLElement;

// Initially hidden
modal.style.display = 'none';

// Show modal when help button is clicked
btn.onclick = (e) => {
  e.preventDefault();
  modal.style.display = 'block';
};

// Close when X is clicked
span.onclick = (e) => {
  e.stopPropagation();
  modal.style.display = 'none';
};

// Close when clicking outside modal
modal.onclick = (event) => {
  if (event.target === modal) {
    modal.style.display = 'none';
  }
};

// Close on Escape key
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modal.style.display === 'block') {
    modal.style.display = 'none';
  }
});
