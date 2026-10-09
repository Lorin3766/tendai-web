// Serron — Welcome modal (first launch only)
// @owner: settings / onboarding
// @role: init

const WELCOME_ACCEPTED_KEY = 'tendai_welcome_accepted';

/**
 * Show welcome modal once per device. On "I Understand & Accept" set flag and close.
 */
export function initWelcomeModal() {
  if (initWelcomeModal.initialized) return;
  initWelcomeModal.initialized = true;

  try {
    if (localStorage.getItem(WELCOME_ACCEPTED_KEY)) return;

    const overlay = document.createElement('div');
    overlay.id = 'welcomeModalOverlay';
    overlay.className = 'profile-modal-overlay welcome-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'welcomeModalTitle');
    overlay.innerHTML = `
      <div class="profile-modal welcome-modal">
        <div class="profile-modal-header">
          <h2 class="card-title" id="welcomeModalTitle">Welcome to Obrium</h2>
        </div>
        <div class="profile-modal-content" style="padding: 20px 24px;">
          <p class="welcome-modal-text">
            By continuing, you agree that Obrium uses your biometric data for lifestyle optimization purposes only and is not a replacement for professional medical help.
          </p>
        </div>
        <div class="profile-modal-footer" style="padding: 16px 24px;">
          <button type="button" class="btn btn-initialize profile-modal-save" id="welcomeModalAccept">I Understand & Accept</button>
        </div>
      </div>
    `;

    const accept = () => {
      try {
        localStorage.setItem(WELCOME_ACCEPTED_KEY, '1');
      } catch (_) {}
      overlay.classList.remove('is-active');
    };

    overlay.querySelector('#welcomeModalAccept').addEventListener('click', accept);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) accept();
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-active'));
  } catch (e) {
    console.warn('[Welcome] init failed', e);
  }
}
