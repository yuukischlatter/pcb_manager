class CanvasManager {
    constructor(container) {
        // Core properties
        this.container = container;
        this.canvasContent = null;
        this.camera = { x: 0, y: 0, zoom: 1 };
        this.bounds = { minZoom: 0.1, maxZoom: 5 };
        
        // Interaction state
        this.isPanning = false;
        this.lastMousePos = { x: 0, y: 0 };
        this.panStartPos = { x: 0, y: 0 };
        this.panStartCamera = { x: 0, y: 0 };
        
        // Performance optimization
        this.transformCache = '';
    }

    initCanvas() {
        // Find or create canvas content wrapper
        this.canvasContent = this.container.querySelector('.canvas-content');
        if (!this.canvasContent) {
            this.canvasContent = document.createElement('div');
            this.canvasContent.className = 'canvas-content';
            this.container.appendChild(this.canvasContent);
        }
        
        // Set up canvas content properties
        this.canvasContent.style.position = 'absolute';
        this.canvasContent.style.top = '0';
        this.canvasContent.style.left = '0';
        this.canvasContent.style.transformOrigin = '0 0';
        this.canvasContent.style.pointerEvents = 'none';
        
        // Initialize event listeners
        this.initEventListeners();
        
        // Apply initial transform
        this.updateTransform();
    }

    initEventListeners() {
        // Pan controls (middle mouse button)
        this.container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.container.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.container.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.container.addEventListener('mouseleave', (e) => this.handleMouseLeave(e));
        
        // Zoom controls
        this.container.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        
        // Prevent context menu on middle/right click
        this.container.addEventListener('contextmenu', (e) => {
            if (e.button === 1 || e.button === 2) {
                e.preventDefault();
            }
        });
        
        // Prevent text selection during pan
        this.container.addEventListener('selectstart', (e) => {
            if (this.isPanning) {
                e.preventDefault();
            }
        });
    }

    handleMouseDown(e) {
        if (e.button === 1) { // Middle mouse button
            e.preventDefault();
            this.startPan(e);
        }
    }

    handleMouseMove(e) {
        if (this.isPanning) {
            this.updatePan(e);
        }
    }

    handleMouseUp(e) {
        if (e.button === 1 && this.isPanning) {
            this.endPan();
        }
    }

    handleMouseLeave(e) {
        // End pan if mouse leaves container
        if (this.isPanning) {
            this.endPan();
        }
    }

    handleWheel(e) {
        e.preventDefault();
        this.handleZoom(e);
    }

    // PAN SYSTEM
    startPan(mouseEvent) {
        this.isPanning = true;
        
        // Store initial positions
        this.panStartPos = { x: mouseEvent.clientX, y: mouseEvent.clientY };
        this.panStartCamera = { x: this.camera.x, y: this.camera.y };
        this.lastMousePos = { x: mouseEvent.clientX, y: mouseEvent.clientY };
        
        // Change cursor
        this.container.style.cursor = 'grabbing';
    }

    updatePan(mouseEvent) {
        if (!this.isPanning) return;
        
        // Calculate delta from start position
        const deltaX = mouseEvent.clientX - this.panStartPos.x;
        const deltaY = mouseEvent.clientY - this.panStartPos.y;
        
        // Update camera position (invert delta for natural feel)
        this.camera.x = this.panStartCamera.x + deltaX;
        this.camera.y = this.panStartCamera.y + deltaY;
        
        // Apply transform
        this.updateTransform();
        
        // Update last mouse position
        this.lastMousePos = { x: mouseEvent.clientX, y: mouseEvent.clientY };
    }

    endPan() {
        this.isPanning = false;
        
        // Reset cursor
        this.container.style.cursor = '';
        
        // Apply final constraints
        this.constrainCamera();
        this.updateTransform();
    }

    // ZOOM SYSTEM
    handleZoom(wheelEvent) {
        // Calculate zoom delta
        const zoomFactor = 1.1;
        const zoomDelta = wheelEvent.deltaY > 0 ? 1 / zoomFactor : zoomFactor;
        
        // Get mouse position relative to container
        const containerRect = this.container.getBoundingClientRect();
        const mouseX = wheelEvent.clientX - containerRect.left;
        const mouseY = wheelEvent.clientY - containerRect.top;
        
        // Convert mouse position to world coordinates before zoom
        const worldPos = this.screenToWorld(mouseX, mouseY);
        
        // Calculate new zoom level
        const newZoom = this.camera.zoom * zoomDelta;
        const constrainedZoom = Math.max(this.bounds.minZoom, Math.min(this.bounds.maxZoom, newZoom));
        
        // If zoom would exceed bounds, don't zoom
        if (constrainedZoom !== newZoom) {
            return;
        }
        
        // Update zoom
        this.camera.zoom = constrainedZoom;
        
        // Convert world position back to screen coordinates after zoom
        const newScreenPos = this.worldToScreen(worldPos.x, worldPos.y);
        
        // Adjust camera position to keep mouse point stationary
        this.camera.x += mouseX - newScreenPos.x;
        this.camera.y += mouseY - newScreenPos.y;
        
        // Apply transform
        this.updateTransform();
    }

    // COORDINATE CONVERSION
    screenToWorld(screenX, screenY) {
        // Convert screen coordinates to world coordinates
        // Account for camera position and zoom
        const worldX = (screenX - this.camera.x) / this.camera.zoom;
        const worldY = (screenY - this.camera.y) / this.camera.zoom;
        
        return { x: worldX, y: worldY };
    }

    worldToScreen(worldX, worldY) {
        // Convert world coordinates to screen coordinates
        // Account for camera position and zoom
        const screenX = worldX * this.camera.zoom + this.camera.x;
        const screenY = worldY * this.camera.zoom + this.camera.y;
        
        return { x: screenX, y: screenY };
    }

    // TRANSFORM APPLICATION
    updateTransform() {
        if (!this.canvasContent) return;
        
        // Create transform string
        const transform = `translate3d(${this.camera.x}px, ${this.camera.y}px, 0) scale(${this.camera.zoom})`;
        
        // Only update if transform changed
        if (this.transformCache !== transform) {
            this.transformCache = transform;
            this.canvasContent.style.transform = transform;
        }
    }

    // BOUNDS AND VALIDATION
    constrainCamera() {
        // Constrain zoom within bounds
        this.camera.zoom = Math.max(this.bounds.minZoom, Math.min(this.bounds.maxZoom, this.camera.zoom));
        
        // Optional: constrain pan to reasonable area around content
        // For now, we'll allow unlimited panning for flexibility
        // This can be enhanced later with content bounds checking
    }

    // UTILITY METHODS
    getCameraState() {
        // Return current camera position and zoom
        return {
            x: this.camera.x,
            y: this.camera.y,
            zoom: this.camera.zoom
        };
    }

    setCameraState(x, y, zoom) {
        // Set camera to specific state
        this.camera.x = x;
        this.camera.y = y;
        this.camera.zoom = zoom;
        
        // Validate bounds
        this.constrainCamera();
        
        // Apply transform
        this.updateTransform();
    }

    resetView() {
        // Reset to initial camera position
        const containerRect = this.container.getBoundingClientRect();
        
        this.setCameraState(
            containerRect.width / 4,
            containerRect.height / 4,
            1.0
        );
    }

    // CONTENT AREA MANAGEMENT
    getCanvasContent() {
        return this.canvasContent;
    }

    // Add module to canvas
    addModuleToCanvas(moduleElement) {
        if (this.canvasContent && moduleElement) {
            moduleElement.style.pointerEvents = 'auto';
            this.canvasContent.appendChild(moduleElement);
        }
    }

    // Clear all modules
    clearCanvas() {
        if (this.canvasContent) {
            this.canvasContent.innerHTML = '';
        }
    }
}