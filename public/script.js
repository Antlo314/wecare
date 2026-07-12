// Mobile nav
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
navLinks.addEventListener('click', e => { if (e.target.tagName === 'A') navLinks.classList.remove('open'); });

document.getElementById('year').textContent = new Date().getFullYear();

// Contact form
const form = document.getElementById('contactForm');
const statusEl = document.getElementById('formStatus');
const submitBtn = document.getElementById('submitBtn');

form.addEventListener('submit', async e => {
  e.preventDefault();
  statusEl.className = 'form-status';
  const data = Object.fromEntries(new FormData(form).entries());

  if (!data.name.trim()) return showStatus('Please enter your name.', false);
  if (!data.email.trim() && !data.phone.trim()) return showStatus('Please provide an email or phone number so we can reach you.', false);

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';
  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
    form.reset();
    showStatus("Thank you — your request has been received. Lisa will reach out soon. 🌿", true);
  } catch (err) {
    showStatus(err.message, false);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Request';
  }
});

function showStatus(msg, ok) {
  statusEl.textContent = msg;
  statusEl.className = 'form-status ' + (ok ? 'ok' : 'err');
}
