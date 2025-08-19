class PCBSystemViewer {
    constructor() {
        // EXISTING PROPERTIES (keep all)
        this.fileSystem = new Map();
        this.allModules = new Map(); // Store all modules by their full path
        this.expandedModules = new Set(); // Track which modules are expanded
        this.selectedModule = null;
        this.rootModules = []; // Top-level modules
        this.connections = new Map(); // Store all connections
        
        // NEW CANVAS PROPERTIES
        this.canvasManager = null;
        this.dragState = {
            isDragging: false,
            draggedModule: null,
            startPos: { x: 0, y: 0 },
            offset: { x: 0, y: 0 },
            hasMoved: false
        };
        this.modulePositions = new Map(); // Store manual positions
        this.clickTimeout = null;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Keep existing file input listener
        document.getElementById('folderInput').addEventListener('change', (e) => {
            this.loadFileSystem(e.target.files);
        });

        // ADD NEW CANVAS EVENT LISTENERS
        const container = document.getElementById('diagramContainer');
        
        // Global canvas controls
        container.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
        container.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        container.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));
        container.addEventListener('mouseleave', (e) => this.handleCanvasMouseLeave(e));
        
        // Zoom controls
        container.addEventListener('wheel', (e) => this.handleCanvasWheel(e));
        
        // Prevent context menu on right click
        container.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // Always prevent context menu
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    handleKeyDown(e) {
        // R key to reset view
        if (e.key === 'r' || e.key === 'R') {
            if (this.canvasManager) {
                this.canvasManager.resetView();
            }
        }
        
        // Escape key to cancel drag
        if (e.key === 'Escape') {
            if (this.dragState.isDragging) {
                this.cancelDrag();
            }
        }
    }

    async loadFileSystem(files) {
        this.fileSystem.clear();
        this.allModules.clear();
        this.expandedModules.clear();
        this.connections.clear();
        this.modulePositions.clear();
        
        try {
            // Process all files
            for (let file of files) {
                const relativePath = file.webkitRelativePath;
                this.fileSystem.set(relativePath, file);
            }

            // Parse all connections.json files
            await this.parseConnectionFiles();
            
            // Build complete module tree from directory structure
            this.buildModuleTreeFromDirectories();
            
            // Start at root
            this.renderSystem();
            
        } catch (error) {
            this.showError('Error loading file system: ' + error.message);
        }
    }

    async parseConnectionFiles() {
        const connectionFiles = Array.from(this.fileSystem.keys())
            .filter(path => path.endsWith('connections.json'));

        console.log('Found connection files:', connectionFiles);

        for (let connectionPath of connectionFiles) {
            try {
                const file = this.fileSystem.get(connectionPath);
                const content = await file.text();
                const connectionData = JSON.parse(content);
                
                // Store connection data with the directory path
                const dirPath = connectionPath.replace('/connections.json', '');
                this.connections.set(dirPath, connectionData);
                console.log(`Loaded connections for ${dirPath}:`, connectionData);
                
            } catch (error) {
                console.warn(`Failed to parse ${connectionPath}:`, error);
            }
        }
    }

    buildModuleTreeFromDirectories() {
        // Find all directories by analyzing file paths
        const allDirectories = new Set();
        
        for (let path of this.fileSystem.keys()) {
            const parts = path.split('/');
            
            // Build all directory paths
            let currentPath = '';
            for (let i = 0; i < parts.length - 1; i++) { // -1 to exclude the filename
                const part = parts[i];
                if (part) {
                    currentPath += (currentPath ? '/' : '') + part;
                    allDirectories.add(currentPath);
                }
            }
        }

        console.log('All directories found:', Array.from(allDirectories));

        // Create module objects for each directory
        allDirectories.forEach(dirPath => {
            const pathParts = dirPath.split('/');
            const name = pathParts[pathParts.length - 1];
            const parentPath = pathParts.slice(0, -1).join('/');
            
            const module = {
                name: name,
                path: dirPath,
                parentPath: parentPath,
                children: [],
                level: pathParts.length - 1,
                type: this.getModuleType(name),
                connections: this.connections.get(dirPath) || null
            };
            
            this.allModules.set(dirPath, module);
        });

        // Build parent-child relationships
        this.allModules.forEach(module => {
            if (module.parentPath && this.allModules.has(module.parentPath)) {
                const parent = this.allModules.get(module.parentPath);
                parent.children.push(module);
            } else if (module.level === 0) {
                // This is a root module
                this.rootModules.push(module);
            }
        });

        // Sort children by name for consistent display
        this.allModules.forEach(module => {
            module.children.sort((a, b) => a.name.localeCompare(b.name));
        });
        this.rootModules.sort((a, b) => a.name.localeCompare(b.name));

        console.log('Root modules:', this.rootModules);
        console.log('All modules:', this.allModules);
    }

    getModuleType(name) {
        if (name.includes('pcb')) return 'pcb';
        if (name.includes('sensor') || name.includes('controller') || name.includes('mcu')) return 'component';
        return 'system';
    }

    renderSystem() {
        const container = document.getElementById('diagramContainer');
        
        // Clear existing content but keep canvas structure
        if (this.canvasManager && this.canvasManager.canvasContent) {
            this.canvasManager.clearCanvas();
        } else {
            container.innerHTML = '';
        }

        if (this.rootModules.length === 0) {
            container.innerHTML = '<div class="instructions"><h3>No modules found</h3></div>';
            return;
        }

        // INITIALIZE CANVAS MANAGER
        if (!this.canvasManager) {
            this.canvasManager = new CanvasManager(container);
            this.canvasManager.initCanvas();
        }

        // Hide instructions when modules are loaded
        const instructions = container.querySelector('.instructions');
        if (instructions) {
            instructions.style.display = 'none';
        }

        // Update breadcrumb to show root
        this.updateBreadcrumb();

        // Render all visible modules
        this.renderAllVisibleModules();
        
        // Render connections between visible modules
        this.renderConnections();
    }

    updateBreadcrumb() {
        const breadcrumb = document.getElementById('breadcrumb');
        breadcrumb.innerHTML = '';
        
        const rootItem = document.createElement('span');
        rootItem.className = 'breadcrumb-item active';
        rootItem.textContent = 'System Root';
        breadcrumb.appendChild(rootItem);
    }

    renderAllVisibleModules() {
        const visibleModules = this.getVisibleModules();
        const positions = this.calculateModulePositions(visibleModules);
        
        visibleModules.forEach((module, index) => {
            this.renderModule(module, positions[index]);
        });
    }

    getVisibleModules() {
        const visible = [];
        
        // Always show root modules
        this.rootModules.forEach(rootModule => {
            visible.push(rootModule);
            this.addExpandedChildren(rootModule, visible);
        });
        
        return visible;
    }

    addExpandedChildren(module, visibleList) {
        if (this.expandedModules.has(module.path)) {
            module.children.forEach(child => {
                visibleList.push(child);
                // Recursively add expanded grandchildren
                this.addExpandedChildren(child, visibleList);
            });
        }
    }

    calculateModulePositions(modules) {
        const positions = [];
        
        modules.forEach(module => {
            // Check if we have a stored position (from dragging)
            const storedPos = this.modulePositions.get(module.path);
            
            if (storedPos) {
                // Use stored position
                positions.push({
                    x: storedPos.x,
                    y: storedPos.y,
                    width: storedPos.width || 250,
                    height: storedPos.height || 120,
                    isChild: this.isChildOfExpandedParent(module),
                    isExpanded: this.expandedModules.has(module.path)
                });
            } else {
                // Use calculated position (existing logic adapted)
                const position = this.calculateInitialPosition(module, modules, positions);
                positions.push(position);
                
                // Store calculated position for future reference
                this.modulePositions.set(module.path, {
                    x: position.x,
                    y: position.y,
                    width: position.width,
                    height: position.height
                });
            }
        });
        
        return positions;
    }

    calculateInitialPosition(module, allModules, existingPositions) {
        const isExpanded = this.expandedModules.has(module.path);
        const hasChildren = module.children.length > 0;
        const isChild = this.isChildOfExpandedParent(module);
        
        if (isChild) {
            // This is a child of an expanded parent - position relative to parent
            return this.calculateChildPosition(module, allModules, existingPositions);
        }
        
        // This is a root-level module - use grid layout
        const rootModules = allModules.filter(m => !this.isChildOfExpandedParent(m));
        const moduleIndex = rootModules.indexOf(module);
        
        const cols = Math.ceil(Math.sqrt(rootModules.length));
        const col = moduleIndex % cols;
        const row = Math.floor(moduleIndex / cols);
        
        const baseWidth = 250;
        const baseHeight = 120;
        const spacing = 50;
        
        // Calculate size for expanded modules
        let width = baseWidth;
        let height = baseHeight;
        
        if (isExpanded && hasChildren) {
            const visibleChildren = module.children.filter(child => allModules.includes(child));
            if (visibleChildren.length > 0) {
                const childLayout = this.calculateExpandedSize(visibleChildren);
                width = Math.max(300, childLayout.width + 80); // 80px padding
                height = Math.max(200, childLayout.height + 120); // 120px for title + padding
            }
        }
        
        return {
            x: col * (baseWidth + spacing) + 50,
            y: row * (baseHeight + spacing) + 50,
            width: width,
            height: height,
            isChild: false,
            isExpanded: isExpanded
        };
    }

    calculateChildPosition(childModule, allModules, existingPositions) {
        const parent = this.allModules.get(childModule.parentPath);
        const parentIndex = allModules.indexOf(parent);
        
        if (parentIndex === -1) {
            // Fallback position
            return { x: 50, y: 50, width: 140, height: 80, isChild: true };
        }
        
        const parentPosition = existingPositions[parentIndex];
        const siblings = parent.children.filter(child => allModules.includes(child));
        const childIndex = siblings.indexOf(childModule);
        
        const childCols = Math.ceil(Math.sqrt(siblings.length));
        const col = childIndex % childCols;
        const row = Math.floor(childIndex / childCols);
        
        const padding = 40;
        const titleHeight = 60;
        const childSpacing = 20;
        const childWidth = 140;
        const childHeight = 80;
        
        return {
            x: parentPosition.x + padding + col * (childWidth + childSpacing),
            y: parentPosition.y + titleHeight + padding + row * (childHeight + childSpacing),
            width: childWidth,
            height: childHeight,
            isChild: true
        };
    }

    calculateExpandedSize(children) {
        const childCols = Math.ceil(Math.sqrt(children.length));
        const childRows = Math.ceil(children.length / childCols);
        const childWidth = 140;
        const childHeight = 80;
        const childSpacing = 20;
        
        const width = (childWidth * childCols) + (childSpacing * (childCols - 1));
        const height = (childHeight * childRows) + (childSpacing * (childRows - 1));
        
        return { width, height };
    }

    isChildOfExpandedParent(module) {
        return module.level > 0 && this.expandedModules.has(module.parentPath);
    }

    renderModule(module, position) {
        const moduleEl = document.createElement('div');
        const isExpanded = this.expandedModules.has(module.path);
        const hasChildren = module.children.length > 0;
        
        moduleEl.className = `module-block ${module.type}`;
        moduleEl.setAttribute('data-module-path', module.path);
        moduleEl.setAttribute('data-draggable', 'true');
        
        if (position.isChild) {
            moduleEl.classList.add('child');
        }
        
        if (isExpanded && hasChildren) {
            moduleEl.classList.add('expanded');
        }
        
        // Set position and size
        moduleEl.style.left = position.x + 'px';
        moduleEl.style.top = position.y + 'px';
        moduleEl.style.width = position.width + 'px';
        moduleEl.style.height = position.height + 'px';
        moduleEl.style.position = 'absolute';
        
        // Special styling for expanded modules
        if (isExpanded && hasChildren) {
            moduleEl.style.backgroundColor = 'rgba(79, 195, 247, 0.1)';
            moduleEl.style.border = '2px solid #4fc3f7';
            moduleEl.style.borderRadius = '15px';
        }
        
        // Add expansion indicator if module has children
        const expansionIndicator = hasChildren ? (isExpanded ? '▼' : '▶') : '';
        
        // Show connection count if module has connections
        const connectionCount = this.getConnectionCount(module);
        const connectionIndicator = connectionCount > 0 ? ` (${connectionCount})` : '';
        
        // Position title based on whether it's expanded
        const titleStyle = isExpanded && hasChildren ? 
            'position: absolute; top: 10px; left: 15px; font-weight: bold; z-index: 10;' : 
            '';
        const typeStyle = isExpanded && hasChildren ? 
            'position: absolute; top: 35px; left: 15px; font-size: 11px; opacity: 0.8; z-index: 10;' : 
            '';
        
        moduleEl.innerHTML = `
            <div class="module-title" style="${titleStyle}">${expansionIndicator} ${module.name}${connectionIndicator}</div>
            <div class="module-type" style="${typeStyle}">${module.type.toUpperCase()}</div>
        `;

        // ADD DRAGGING CAPABILITY
        moduleEl.style.cursor = 'grab';
        moduleEl.style.userSelect = 'none';

        // Add mouse event handlers for dragging and expansion
        moduleEl.addEventListener('mousedown', (e) => this.handleModuleMouseDown(module, e));
        moduleEl.addEventListener('mouseenter', () => this.selectModule(module));

        // Add to canvas instead of container
        this.canvasManager.addModuleToCanvas(moduleEl);
    }

    // CANVAS INTERACTION METHODS

    handleCanvasMouseDown(e) {
        if (e.button === 1) { // Middle mouse button
            e.preventDefault();
            // Canvas manager will handle this through its own listeners
        }
    }

    handleCanvasMouseMove(e) {
        if (this.dragState.isDragging) {
            this.updateModuleDrag(e);
        }
    }

    handleCanvasMouseUp(e) {
        if (this.dragState.isDragging && e.button === 2) { // Right click drag end
            this.endModuleDrag(e);
        }
    }

    handleCanvasMouseLeave(e) {
        // End drag if mouse leaves canvas
        if (this.dragState.isDragging) {
            this.endModuleDrag(e);
        }
    }

    handleCanvasWheel(e) {
        // Canvas manager handles this through its own listeners
    }

    // MODULE DRAGGING METHODS

    handleModuleMouseDown(module, mouseEvent) {
        if (mouseEvent.button === 0) { // Left click - expand/collapse only
            mouseEvent.stopPropagation();
            this.toggleModuleExpansion(module);
        } else if (mouseEvent.button === 2) { // Right click - start drag
            mouseEvent.stopPropagation();
            mouseEvent.preventDefault(); // Prevent context menu
            this.startModuleDrag(module, mouseEvent);
        }
    }

    startModuleDrag(module, mouseEvent) {
        const moduleEl = document.querySelector(`[data-module-path="${module.path}"]`);
        const rect = moduleEl.getBoundingClientRect();
        const containerRect = this.canvasManager.container.getBoundingClientRect();

        this.dragState = {
            isDragging: true, // Start dragging immediately for right-click
            draggedModule: module,
            startPos: { x: mouseEvent.clientX, y: mouseEvent.clientY },
            offset: {
                x: mouseEvent.clientX - rect.left + containerRect.left,
                y: mouseEvent.clientY - rect.top + containerRect.top
            },
            hasMoved: false
        };

        moduleEl.style.cursor = 'grabbing';
        moduleEl.style.zIndex = '1000';
        moduleEl.classList.add('dragging');
    }

    updateModuleDrag(mouseEvent) {
        if (!this.dragState.draggedModule || !this.dragState.isDragging) return;

        // Get mouse position relative to canvas
        const containerRect = this.canvasManager.container.getBoundingClientRect();
        const canvasX = mouseEvent.clientX - containerRect.left;
        const canvasY = mouseEvent.clientY - containerRect.top;
        
        // Convert to world coordinates
        const worldPos = this.canvasManager.screenToWorld(
            canvasX - this.dragState.offset.x,
            canvasY - this.dragState.offset.y
        );

        // Update module position
        this.updateModulePosition(this.dragState.draggedModule, worldPos);
        
        // Update parent container if needed
        this.updateParentContainer(this.dragState.draggedModule);
        
        // Update connections in real-time
        this.renderConnections();
    }

    endModuleDrag(mouseEvent) {
        if (this.dragState.draggedModule) {
            const moduleEl = document.querySelector(`[data-module-path="${this.dragState.draggedModule.path}"]`);
            if (moduleEl) {
                moduleEl.style.cursor = 'grab';
                moduleEl.style.zIndex = '10';
                moduleEl.classList.remove('dragging');
            }
            
            // Final update of connections
            this.renderConnections();
        }

        this.dragState = {
            isDragging: false,
            draggedModule: null,
            startPos: { x: 0, y: 0 },
            offset: { x: 0, y: 0 },
            hasMoved: false
        };
    }

    cancelDrag() {
        // Cancel current drag operation
        if (this.dragState.isDragging && this.dragState.draggedModule) {
            // Reset to original position
            const originalPos = this.modulePositions.get(this.dragState.draggedModule.path);
            if (originalPos) {
                this.updateModulePosition(this.dragState.draggedModule, originalPos);
            }
        }
        
        this.endModuleDrag();
    }

    updateModulePosition(module, worldPos) {
        // Get current position to calculate delta
        const currentPos = this.modulePositions.get(module.path);
        const deltaX = currentPos ? worldPos.x - currentPos.x : 0;
        const deltaY = currentPos ? worldPos.y - currentPos.y : 0;
        
        // Store new position for this module
        const moduleEl = document.querySelector(`[data-module-path="${module.path}"]`);
        const width = moduleEl ? moduleEl.offsetWidth : 250;
        const height = moduleEl ? moduleEl.offsetHeight : 120;
        
        this.modulePositions.set(module.path, {
            x: worldPos.x,
            y: worldPos.y,
            width: width,
            height: height
        });
        
        // Update DOM element position
        if (moduleEl) {
            moduleEl.style.left = worldPos.x + 'px';
            moduleEl.style.top = worldPos.y + 'px';
        }
        
        // If this is an expanded parent, move ALL descendants by the same delta
        if (this.expandedModules.has(module.path) && (deltaX !== 0 || deltaY !== 0)) {
            this.moveAllDescendants(module, deltaX, deltaY);
        }
    }

    moveAllDescendants(parentModule, deltaX, deltaY) {
        const visibleModules = this.getVisibleModules();
        
        // Recursively move all descendants
        const moveChildren = (module) => {
            module.children.forEach(child => {
                // Only move if child is visible
                if (visibleModules.includes(child)) {
                    const childPos = this.modulePositions.get(child.path);
                    if (childPos) {
                        const newChildPos = {
                            x: childPos.x + deltaX,
                            y: childPos.y + deltaY,
                            width: childPos.width,
                            height: childPos.height
                        };
                        
                        // Update child position
                        this.modulePositions.set(child.path, newChildPos);
                        
                        // Update child DOM element
                        const childEl = document.querySelector(`[data-module-path="${child.path}"]`);
                        if (childEl) {
                            childEl.style.left = newChildPos.x + 'px';
                            childEl.style.top = newChildPos.y + 'px';
                        }
                        
                        // Recursively move this child's children
                        if (this.expandedModules.has(child.path)) {
                            moveChildren(child);
                        }
                    }
                }
            });
        };
        
        // Start the recursive movement
        moveChildren(parentModule);
    }

    updateParentContainer(movedModule) {
        // Cascade effect: update parent chain all the way up
        let currentModule = movedModule;
        
        while (currentModule.parentPath) {
            const parent = this.allModules.get(currentModule.parentPath);
            if (parent && this.expandedModules.has(parent.path)) {
                this.recalculateParentBounds(parent);
                currentModule = parent; // Move up the chain
            } else {
                break; // Stop if parent not expanded or doesn't exist
            }
        }
    }

    recalculateParentBounds(parentModule) {
        // Get all visible children positions
        const visibleModules = this.getVisibleModules();
        const children = parentModule.children.filter(child => 
            visibleModules.includes(child)
        );

        const parentEl = document.querySelector(`[data-module-path="${parentModule.path}"]`);
        if (!parentEl) return;

        // If no visible children (collapsed), reset to default size
        if (children.length === 0) {
            const defaultWidth = 250;
            const defaultHeight = 120;
            const currentPos = this.modulePositions.get(parentModule.path);
            const currentX = currentPos ? currentPos.x : 50;
            const currentY = currentPos ? currentPos.y : 50;
            
            // Reset to default size
            parentEl.style.width = defaultWidth + 'px';
            parentEl.style.height = defaultHeight + 'px';
            
            // Store default position
            this.modulePositions.set(parentModule.path, {
                x: currentX,
                y: currentY,
                width: defaultWidth,
                height: defaultHeight
            });
            
            return;
        }

        // If has visible children (expanded), calculate bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        children.forEach(child => {
            const pos = this.modulePositions.get(child.path);
            if (pos) {
                minX = Math.min(minX, pos.x);
                minY = Math.min(minY, pos.y);
                maxX = Math.max(maxX, pos.x + pos.width);
                maxY = Math.max(maxY, pos.y + pos.height);
            }
        });

        if (minX === Infinity) return; // No valid positions found

        // Add padding
        const padding = 40;
        const titleHeight = 60;
        
        const newX = minX - padding;
        const newY = minY - titleHeight - padding;
        const newWidth = maxX - minX + padding * 2;
        const newHeight = maxY - minY + titleHeight + padding * 2;
        
        // Update parent container
        parentEl.style.left = newX + 'px';
        parentEl.style.top = newY + 'px';
        parentEl.style.width = newWidth + 'px';
        parentEl.style.height = newHeight + 'px';

        // Store parent position
        this.modulePositions.set(parentModule.path, {
            x: newX,
            y: newY,
            width: newWidth,
            height: newHeight
        });
    }

    renderConnections() {
        // Remove existing connection lines
        document.querySelectorAll('.connection-line').forEach(line => line.remove());
        
        const visibleModules = this.getVisibleModules();
        const connectionPairs = this.calculateConnectionPairs(visibleModules);
        
        connectionPairs.forEach(pair => {
            this.renderConnectionArrow(pair.from, pair.to, pair.connections);
        });
    }

    calculateConnectionPairs(visibleModules) {
        const pairs = new Map(); // Use Map to aggregate connections between same modules
        
        // For each visible module, find its connections
        visibleModules.forEach(module => {
            const connections = this.getConnectionsForModule(module, visibleModules);
            
            connections.forEach(conn => {
                const target = this.findTargetModule(conn.target, visibleModules);
                if (target) {
                    const key = `${module.path}->${target.path}`;
                    if (!pairs.has(key)) {
                        pairs.set(key, {
                            from: module,
                            to: target,
                            connections: []
                        });
                    }
                    pairs.get(key).connections.push(conn);
                }
            });
        });
        
        return Array.from(pairs.values());
    }

    getConnectionsForModule(module, visibleModules) {
        const connections = [];
        
        // If this module has direct connections and no visible children, use its connections
        if (module.connections && module.connections.connections) {
            const hasVisibleChildren = module.children.some(child => visibleModules.includes(child));
            if (!hasVisibleChildren) {
                connections.push(...module.connections.connections);
            }
        }
        
        // Add connections from children that are not visible (collapsed)
        module.children.forEach(child => {
            if (!visibleModules.includes(child)) {
                connections.push(...this.getConnectionsForModule(child, visibleModules));
            }
        });
        
        return connections;
    }

    findTargetModule(targetPath, visibleModules) {
        // Handle relative paths
        if (targetPath.startsWith('../') || targetPath.startsWith('./')) {
            // For now, let's try to find by the final name
            const targetName = targetPath.split('/').pop();
            
            // Find module by name
            for (let module of visibleModules) {
                if (module.name === targetName) {
                    return module;
                }
            }
        } else {
            // Absolute path - try direct lookup
            let targetModule = this.allModules.get(targetPath);
            if (targetModule && visibleModules.includes(targetModule)) {
                return targetModule;
            }
            
            // If not found, try by final component name
            const targetName = targetPath.split('/').pop();
            for (let module of visibleModules) {
                if (module.name === targetName) {
                    return module;
                }
            }
        }
        
        return null;
    }

    renderConnectionArrow(fromModule, toModule, connections) {
        const fromEl = document.querySelector(`[data-module-path="${fromModule.path}"]`);
        const toEl = document.querySelector(`[data-module-path="${toModule.path}"]`);
        
        if (!fromEl || !toEl) return;

        // Get positions relative to the canvas content
        const fromRect = {
            left: parseFloat(fromEl.style.left) || 0,
            top: parseFloat(fromEl.style.top) || 0,
            width: fromEl.offsetWidth,
            height: fromEl.offsetHeight
        };
        
        const toRect = {
            left: parseFloat(toEl.style.left) || 0,
            top: parseFloat(toEl.style.top) || 0,
            width: toEl.offsetWidth,
            height: toEl.offsetHeight
        };

        // Calculate edge-to-edge connection points
        const fromCenter = {
            x: fromRect.left + fromRect.width / 2,
            y: fromRect.top + fromRect.height / 2
        };
        
        const toCenter = {
            x: toRect.left + toRect.width / 2,
            y: toRect.top + toRect.height / 2
        };

        // Determine which edges to connect
        const dx = toCenter.x - fromCenter.x;
        const dy = toCenter.y - fromCenter.y;

        let startX, startY, endX, endY;

        // From module: determine exit point
        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal connection is dominant
            if (dx > 0) {
                // Connect from right edge of from module
                startX = fromRect.left + fromRect.width;
                startY = fromCenter.y;
            } else {
                // Connect from left edge of from module
                startX = fromRect.left;
                startY = fromCenter.y;
            }
        } else {
            // Vertical connection is dominant
            if (dy > 0) {
                // Connect from bottom edge of from module
                startX = fromCenter.x;
                startY = fromRect.top + fromRect.height;
            } else {
                // Connect from top edge of from module
                startX = fromCenter.x;
                startY = fromRect.top;
            }
        }

        // To module: determine entry point
        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal connection is dominant
            if (dx > 0) {
                // Connect to left edge of to module
                endX = toRect.left;
                endY = toCenter.y;
            } else {
                // Connect to right edge of to module
                endX = toRect.left + toRect.width;
                endY = toCenter.y;
            }
        } else {
            // Vertical connection is dominant
            if (dy > 0) {
                // Connect to top edge of to module
                endX = toCenter.x;
                endY = toRect.top;
            } else {
                // Connect to bottom edge of to module
                endX = toCenter.x;
                endY = toRect.top + toRect.height;
            }
        }

        // Calculate line properties
        const length = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        const angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;

        // Create arrow line
        const line = document.createElement('div');
        line.className = 'connection-line';
        
        // Make line thicker based on number of connections
        const thickness = Math.min(8, Math.max(2, connections.length * 2));
        line.style.height = thickness + 'px';
        
        line.style.left = startX + 'px';
        line.style.top = startY + 'px';
        line.style.width = length + 'px';
        line.style.transform = `rotate(${angle}deg)`;
        line.style.zIndex = '5';
        line.style.position = 'absolute';

        // Add arrow head
        const arrow = document.createElement('div');
        arrow.className = 'connection-arrow';
        arrow.style.borderLeftWidth = (thickness + 8) + 'px';
        arrow.style.borderTopWidth = (thickness + 3) + 'px';
        arrow.style.borderBottomWidth = (thickness + 3) + 'px';
        line.appendChild(arrow);

        // Add tooltip with connection details
        const connectionDetails = connections.map(conn => 
            `${conn.interface || 'Unknown'}: ${conn.description || 'No description'}`
        ).join('\n');
        
        line.title = `${connections.length} connection(s):\n${connectionDetails}`;
        
        // Add to canvas content
        this.canvasManager.addModuleToCanvas(line);
    }

    toggleModuleExpansion(module) {
        if (module.children.length === 0) {
            // No children to expand, just select
            this.selectModule(module);
            return;
        }

        if (this.expandedModules.has(module.path)) {
            // Collapse: remove this module and all its descendants
            this.collapseModule(module);
        } else {
            // Expand: add this module to expanded set
            this.expandedModules.add(module.path);
        }

        // Re-render the entire system
        this.renderSystem();
        
        // Trigger cascade effect after expand/collapse
        this.recalculateParentBounds(module);
        this.updateParentContainer(module);
        
        // Update connections just like dragging does
        this.renderConnections();
        
        // Keep the module selected
        this.selectModule(module);
    }

    collapseModule(module) {
        // Remove this module from expanded set
        this.expandedModules.delete(module.path);
        
        // Recursively collapse all children
        module.children.forEach(child => {
            this.collapseModule(child);
        });
    }

    selectModule(module) {
        this.selectedModule = module;
        this.updateDetailsPanel();
        
        // Add visual selection indication
        document.querySelectorAll('.module-block').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Find and highlight the selected module
        const selectedEl = document.querySelector(`[data-module-path="${module.path}"]`);
        if (selectedEl) {
            selectedEl.classList.add('selected');
        }
    }

    updateDetailsPanel() {
        const panel = document.getElementById('detailsPanel');
        
        if (!this.selectedModule) {
            panel.innerHTML = '<h3>Module Details</h3><p>Select a module to view its connections and details.</p>';
            return;
        }

        const module = this.selectedModule;
        let html = `<h3>${module.name}</h3>`;
        
        html += `<p><strong>Type:</strong> ${module.type}</p>`;
        html += `<p><strong>Path:</strong> ${module.path}</p>`;
        html += `<p><strong>Level:</strong> ${module.level}</p>`;
        html += `<p><strong>Children:</strong> ${module.children.length}</p>`;
        
        // Show current position if manually positioned
        const position = this.modulePositions.get(module.path);
        if (position) {
            html += `<p><strong>Position:</strong> (${Math.round(position.x)}, ${Math.round(position.y)})</p>`;
        }
        
        if (module.connections && module.connections.connections) {
            html += '<h4>Direct Connections:</h4>';
            
            module.connections.connections.forEach(conn => {
                html += `
                    <div class="connection-item">
                        <div class="connection-target">${conn.target}</div>
                        <div class="connection-details">
                            <strong>Type:</strong> ${conn.type || 'Unknown'}<br>
                            <strong>Interface:</strong> ${conn.interface || 'Unknown'}<br>
                            <strong>Signals:</strong> ${Array.isArray(conn.signals) ? conn.signals.join(', ') : (conn.signals || 'None')}<br>
                            <strong>Description:</strong> ${conn.description || 'No description'}
                        </div>
                    </div>
                `;
            });
        }
        
        const totalConnections = this.getConnectionCount(module);
        if (totalConnections > 0) {
            html += `<p><strong>Total Connections (including children):</strong> ${totalConnections}</p>`;
        }

        if (module.children.length > 0) {
            const isExpanded = this.expandedModules.has(module.path);
            html += `<p><em>Click to ${isExpanded ? 'collapse' : 'expand'} submodules</em></p>`;
        }

        panel.innerHTML = html;
    }

    getConnectionCount(module) {
        if (module.connections && module.connections.connections) {
            return module.connections.connections.length;
        }
        
        // Count connections from all children recursively
        let count = 0;
        module.children.forEach(child => {
            count += this.getConnectionCount(child);
        });
        return count;
    }

    showError(message) {
        const container = document.getElementById('diagramContainer');
        container.innerHTML = `<div class="error-message">${message}</div>`;
    }
}

// Initialize the viewer
const viewer = new PCBSystemViewer();