document.addEventListener('DOMContentLoaded', () => {
  const phoneInput = document.getElementById('phoneInput') || document.getElementById('phoneNumber');
  const getPairingBtn = document.getElementById('getPairingBtn') || document.getElementById('generateBtn');
  const spinner = document.getElementById('spinner');
  const btnText = document.querySelector('.btn-text');
  const resultCard = document.getElementById('resultCard') || document.getElementById('resultSection');
  const pairingCodeDisplay = document.getElementById('pairingCodeDisplay');
  const copyBtn = document.getElementById('copyBtn');
  const timerBadge = document.getElementById('timerBadge');

  let pollInterval = null;

  if (getPairingBtn) {
    getPairingBtn.addEventListener('click', async () => {
      let num = phoneInput.value.replace(/[^0-9]/g, '');

      // Auto-correct Pakistani 03... format to 923...
      if (num.startsWith('03') && num.length === 11) {
        num = '92' + num.slice(1);
        phoneInput.value = num;
      }
      if (num.startsWith('9203') && num.length === 13) {
        num = '923' + num.slice(4);
        phoneInput.value = num;
      }

      if (!num || num.length < 10) {
        alert('Please enter a valid phone number with country code (e.g. 923001234567)');
        phoneInput.focus();
        return;
      }

      getPairingBtn.disabled = true;
      if (spinner) spinner.style.display = 'inline-block';
      if (btnText) btnText.textContent = 'Requesting Code from WhatsApp...';
      if (resultCard) resultCard.classList.add('hidden');
      if (pollInterval) clearInterval(pollInterval);

      try {
        const response = await fetch(`/pair?number=${encodeURIComponent(num)}`);
        const data = await response.json();

        if (data.status === 'success' && data.code) {
          pairingCodeDisplay.textContent = data.code;
          resultCard.classList.remove('hidden');
          resultCard.scrollIntoView({ behavior: 'smooth' });

          // Start 150s countdown timer
          let timeLeft = data.expiresIn || 150;
          const countdown = setInterval(() => {
            timeLeft--;
            if (timerBadge) {
              timerBadge.textContent = `⏱️ Code valid for ${timeLeft}s. Enter into WhatsApp now!`;
            }
            if (timeLeft <= 0) clearInterval(countdown);
          }, 1000);

          // Poll connection status every 3 seconds
          pollInterval = setInterval(async () => {
            try {
              const stRes = await fetch(`/pair/status?number=${encodeURIComponent(num)}`);
              const stData = await stRes.json();
              if (stData.status === 'connected') {
                clearInterval(pollInterval);
                clearInterval(countdown);
                pairingCodeDisplay.textContent = 'LINKED! ✅';
                pairingCodeDisplay.style.color = '#00f0a0';
                if (timerBadge) {
                  timerBadge.innerHTML = '🎉 *SUCCESS! SAQIB-MD is now active on your WhatsApp!*';
                  timerBadge.style.color = '#00f0a0';
                }
                alert('Mubarak ho! WhatsApp successfully link ho chuka hai! Type .menu to start.');
              }
            } catch (_) {}
          }, 3000);

        } else {
          alert(data.message || 'Failed to generate code. Please verify number format and retry.');
        }
      } catch (err) {
        console.error(err);
        alert('Server connection error. Please make sure the bot server is online.');
      } finally {
        getPairingBtn.disabled = false;
        if (spinner) spinner.style.display = 'none';
        if (btnText) btnText.textContent = 'Generate 8-Digit Pairing Code';
      }
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const code = pairingCodeDisplay.textContent.trim();
      if (!code || code.includes('-') && code.length < 8) return;

      navigator.clipboard.writeText(code).then(() => {
        const copyTextSpan = document.getElementById('copyBtnText');
        if (copyTextSpan) copyTextSpan.textContent = 'Copied!';
        copyBtn.style.background = '#00f0a0';
        copyBtn.style.color = '#03140d';
        setTimeout(() => {
          if (copyTextSpan) copyTextSpan.textContent = 'Copy';
          copyBtn.style.background = 'rgba(0, 240, 160, 0.15)';
          copyBtn.style.color = '#00f0a0';
        }, 2000);
      });
    });
  }
});
