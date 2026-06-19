(() => {
    const buttons = document.querySelectorAll('.tool-button[data-href]');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalBox = document.getElementById('modal-box');
    const modalTitle = document.getElementById('modal-title');
    const modalDesc = document.getElementById('modal-description');
    const btnGo = document.getElementById('modal-go');
    const btnClose = document.getElementById('modal-close');

    if (!buttons.length || !modalOverlay || !modalBox || !modalTitle || !modalDesc || !btnGo || !btnClose) return;

    let currentTargetUrl = '';

    function setTransformOrigin(element) {
        const rect = element.getBoundingClientRect();
        const btnCenterX = rect.left + rect.width / 2;
        const btnCenterY = rect.top + rect.height / 2;
        const winCenterX = window.innerWidth / 2;
        const winCenterY = window.innerHeight / 2;
        const offsetX = btnCenterX - winCenterX;
        const offsetY = btnCenterY - winCenterY;
        modalBox.style.transformOrigin = 'calc(50% + ' + offsetX + 'px) calc(50% + ' + offsetY + 'px)';
    }

    function openModal(title, desc, url, sourceBtn) {
        modalTitle.textContent = title;
        modalDesc.textContent = desc;
        currentTargetUrl = url;
        setTransformOrigin(sourceBtn);
        modalOverlay.classList.add('active');
    }

    function closeModal() {
        modalOverlay.classList.remove('active');
        currentTargetUrl = '';
    }

    buttons.forEach(button => {
        const url = button.getAttribute('data-href');

        button.addEventListener('auxclick', (e) => {
            if (e.button === 1 && url) {
                e.preventDefault();
                window.open(url, '_blank');
            }
        });

        button.addEventListener('dblclick', (e) => {
            if (url) window.location.href = url;
        });

        button.addEventListener('click', (e) => {
            if (e.button === 1) return;

            const title = button.innerText.trim();
            const desc = button.getAttribute('data-desc');

            if (e.ctrlKey || e.metaKey) {
                if (url) window.open(url, '_blank');
                return;
            }

            if (e.shiftKey) {
                if (url) window.open(url, '_blank', 'popup=yes,width=1024,height=768');
                return;
            }

            openModal(title, desc, url, button);
        });
    });

    btnGo.addEventListener('click', () => {
        if (currentTargetUrl) {
            btnGo.style.transform = 'scale(0.92)';
            setTimeout(() => {
                window.location.href = currentTargetUrl;
            }, 100);
        }
    });

    btnClose.addEventListener('click', closeModal);

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
            closeModal();
        }
    });
})();
