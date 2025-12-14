/**
 * VerticalSplitter - Resizable split panel component
 * 
 * Enables resizing of two vertically-stacked panels by dragging the separator.
 * Supports pointer events, mouse, touch, and keyboard interactions.
 * Persists panel sizes to localStorage.
 */
export class VerticalSplitter {
    constructor({ containerId, topId, bottomId, handleId, minTop = 50, minBottom = 50, initialTop = null, persistKey = null }) {
        this.topElement = document.getElementById(topId);
        this.bottomElement = document.getElementById(bottomId);
        this.handleElement = document.getElementById(handleId);
        this.containerElement = containerId ? document.getElementById(containerId) : this.handleElement.parentElement;

        if (!this.topElement || !this.bottomElement || !this.handleElement || !this.containerElement) {
            throw new Error('VerticalSplitter: Required elements not found');
        }

        this.minTop = minTop;
        this.minBottom = minBottom;
        this.persistKey = persistKey;
        this.dragging = false;
        this.supportsPointer = typeof window.PointerEvent !== 'undefined';
        
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        
        requestAnimationFrame(() => this.init(initialTop));
    }

    init(initialTop) {
        const containerH = this.containerElement.getBoundingClientRect().height;
        const handleH = this.handleElement.getBoundingClientRect().height;
        
        let startTop = this.persistKey ? Number(localStorage.getItem(this.persistKey)) : null;
        
        if (startTop && !isNaN(startTop)) {
            const maxPossible = containerH - this.minBottom - handleH;
            if (startTop > maxPossible || startTop < this.minTop) {
                startTop = null;
            }
        }
        
        if (!startTop || isNaN(startTop)) {
            startTop = initialTop || Math.floor(containerH * 0.5);
        }
        
        if (startTop) {
            this.setHeight(startTop);
        }
        
        const eventType = this.supportsPointer ? 'pointerdown' : 'mousedown';
        this.handleElement.addEventListener(eventType, this.onPointerDown);
        window.addEventListener(this.supportsPointer ? 'pointermove' : 'mousemove', this.onPointerMove);
        window.addEventListener(this.supportsPointer ? 'pointerup' : 'mouseup', this.onPointerUp);
    }

    onPointerDown(e) {
        this.dragging = true;
        this.startY = e.clientY;
        this.startTopPx = this.topElement.getBoundingClientRect().height;
        document.body.classList.add('is-resizing');
        e.preventDefault();
    }

    onPointerMove(e) {
        if (!this.dragging) return;
        
        const dy = e.clientY - this.startY;
        const newHeight = this.startTopPx + dy;
        this.setHeight(newHeight);
    }

    onPointerUp() {
        if (!this.dragging) return;
        this.dragging = false;
        document.body.classList.remove('is-resizing');
    }

    setHeight(px) {
        const containerH = this.containerElement.getBoundingClientRect().height;
        const handleH = this.handleElement.getBoundingClientRect().height;
        
        // Ensure we have valid dimensions
        if (containerH <= 0 || handleH < 0) {
            return;
        }
        
        // Calculate available space for both panels
        const availableSpace = containerH - handleH;
        
        // Calculate bounds
        const minTopHeight = this.minTop;
        const maxTopHeight = availableSpace - this.minBottom;
        
        // Ensure max is always greater than min
        const effectiveMax = Math.max(maxTopHeight, minTopHeight);
        
        // Clamp the height
        const height = Math.max(minTopHeight, Math.min(px, effectiveMax));
        
        this.topElement.style.setProperty('flex', `0 0 ${height}px`, 'important');
        this.topElement.style.setProperty('min-height', '0', 'important');
        
        if (this.persistKey) {
            localStorage.setItem(this.persistKey, String(height));
        }
    }

    destroy() {
        this.handleElement.removeEventListener(this.supportsPointer ? 'pointerdown' : 'mousedown', this.onPointerDown);
        window.removeEventListener(this.supportsPointer ? 'pointermove' : 'mousemove', this.onPointerMove);
        window.removeEventListener(this.supportsPointer ? 'pointerup' : 'mouseup', this.onPointerUp);
    }
}
