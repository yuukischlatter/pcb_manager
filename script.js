class PCBSystemViewer {
    constructor() {
        this.fileSystem = new Map();
        this.allModules = new Map(); // Store all modules by their full path
        this.expandedModules = new Set(); // Track which modules are expanded
        this.selectedModule = null;
        this.rootModules = []; // Top-level modules
        this.connections = new Map(); // Store all connections
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('folderInput').addEventListener('change', (e) => {
            this.loadFileSystem(e.target.files);
        });
    }

    async loadFileSystem(files) {
        this.fileSystem.clear();
        this.allModules.clear();
        this.expandedModules.clear();
        this.connections.clear();
        
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
        container.innerHTML = '';

        if (this.rootModules.length === 0) {
            container.innerHTML = '<div class="instructions"><h3>No modules found</h3></div>';
            return;
        }

        // Update breadcrumb to show root
        this.updateBreadcrumb();

        // Render all visible modules (root + expanded children)
        this.renderAllVisibleModules(container);
        
        // Render connections between visible modules
        this.renderConnections(container);
    }

    updateBreadcrumb() {
        const breadcrumb = document.getElementById('breadcrumb');
        breadcrumb.innerHTML = '';
        
        const rootItem = document.createElement('span');
        rootItem.className = 'breadcrumb-item active';
        rootItem.textContent = 'System Root';
        breadcrumb.appendChild(rootItem);
    }

    renderAllVisibleModules(container) {
        const visibleModules = this.getVisibleModules();
        const positions = this.calculateModulePositions(visibleModules);
        
        visibleModules.forEach((module, index) => {
            this.renderModule(module, positions[index], container);
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
        const container = document.getElementById('diagramContainer');
        const containerRect = container.getBoundingClientRect();
        const positions = [];
        
        // Group modules by level for better layout
        const modulesByLevel = new Map();
        modules.forEach(module => {
            if (!modulesByLevel.has(module.level)) {
                modulesByLevel.set(module.level, []);
            }
            modulesByLevel.get(module.level).push(module);
        });

        // Position modules level by level
        let currentY = 50;
        
        modulesByLevel.forEach((levelModules, level) => {
            const cols = Math.ceil(Math.sqrt(levelModules.length));
            const spacingX = Math.max(200, (containerRect.width - 400) / cols); // Account for sidebar
            const spacingY = 150;

            levelModules.forEach((module, index) => {
                const col = index % cols;
                const row = Math.floor(index / cols);
                
                const x = 50 + col * spacingX;
                const y = currentY + row * spacingY;
                
                // If this module is a child of an expanded parent, position it relative to parent
                if (module.level > 0) {
                    const parent = this.allModules.get(module.parentPath);
                    if (parent && this.expandedModules.has(parent.path)) {
                        // Find parent position and offset from it
                        const parentIndex = modules.indexOf(parent);
                        if (parentIndex >= 0) {
                            const parentPos = positions[parentIndex];
                            if (parentPos) {
                                // Position children in a grid starting to the right of parent
                                const childrenOfParent = parent.children.filter(child => modules.includes(child));
                                const childIndex = childrenOfParent.indexOf(module);
                                const childCols = Math.ceil(Math.sqrt(childrenOfParent.length));
                                const childCol = childIndex % childCols;
                                const childRow = Math.floor(childIndex / childCols);
                                
                                positions.push({
                                    x: parentPos.x + 200 + childCol * 180,
                                    y: parentPos.y + childRow * 120,
                                    isChild: true,
                                    parent: parent
                                });
                                return;
                            }
                        }
                    }
                }
                
                positions.push({
                    x: x,
                    y: y,
                    isChild: false
                });
            });
            
            // Update currentY for next level
            const rowsUsed = Math.ceil(levelModules.filter(m => !this.isChildOfExpandedParent(m)).length / cols);
            currentY += (rowsUsed * spacingY) + 100;
        });

        return positions;
    }

    isChildOfExpandedParent(module) {
        return module.level > 0 && this.expandedModules.has(module.parentPath);
    }

    renderModule(module, position, container) {
        const moduleEl = document.createElement('div');
        const isExpanded = this.expandedModules.has(module.path);
        const hasChildren = module.children.length > 0;
        
        moduleEl.className = `module-block ${module.type}`;
        moduleEl.setAttribute('data-module-path', module.path);
        
        if (position.isChild) {
            moduleEl.classList.add('child');
        }
        
        if (isExpanded && hasChildren) {
            moduleEl.classList.add('expanded');
        }
        
        moduleEl.style.left = position.x + 'px';
        moduleEl.style.top = position.y + 'px';
        
        // Add expansion indicator if module has children
        const expansionIndicator = hasChildren ? (isExpanded ? '▼' : '▶') : '';
        
        // Show connection count if module has connections
        const connectionCount = this.getConnectionCount(module);
        const connectionIndicator = connectionCount > 0 ? ` (${connectionCount})` : '';
        
        moduleEl.innerHTML = `
            <div class="module-title">${expansionIndicator} ${module.name}${connectionIndicator}</div>
            <div class="module-type">${module.type.toUpperCase()}</div>
        `;

        // Add click handler for expansion/collapse
        moduleEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleModuleExpansion(module);
        });

        // Add hover handler for selection
        moduleEl.addEventListener('mouseenter', () => {
            this.selectModule(module);
        });

        container.appendChild(moduleEl);
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

    renderConnections(container) {
        const visibleModules = this.getVisibleModules();
        const connectionPairs = this.calculateConnectionPairs(visibleModules);
        
        connectionPairs.forEach(pair => {
            this.renderConnectionArrow(pair.from, pair.to, pair.connections, container);
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
        // Convert relative path to absolute path and find the most specific visible module
        
        // For now, let's assume targetPath is relative from root
        // Find exact match first
        let targetModule = this.allModules.get(targetPath);
        if (targetModule && visibleModules.includes(targetModule)) {
            return targetModule;
        }
        
        // If exact target not visible, find the closest visible parent
        const pathParts = targetPath.split('/');
        for (let i = pathParts.length - 1; i >= 0; i--) {
            const parentPath = pathParts.slice(0, i).join('/');
            const parentModule = this.allModules.get(parentPath);
            if (parentModule && visibleModules.includes(parentModule)) {
                return parentModule;
            }
        }
        
        return null;
    }

    renderConnectionArrow(fromModule, toModule, connections, container) {
        const fromEl = container.querySelector(`[data-module-path="${fromModule.path}"]`);
        const toEl = container.querySelector(`[data-module-path="${toModule.path}"]`);
        
        if (!fromEl || !toEl) return;

        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Calculate arrow line
        const startX = fromRect.left - containerRect.left + fromRect.width / 2;
        const startY = fromRect.top - containerRect.top + fromRect.height / 2;
        const endX = toRect.left - containerRect.left + toRect.width / 2;
        const endY = toRect.top - containerRect.top + toRect.height / 2;

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
        
        container.appendChild(line);
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

    showError(message) {
        const container = document.getElementById('diagramContainer');
        container.innerHTML = `<div class="error-message">${message}</div>`;
    }
}

// Initialize the viewer
const viewer = new PCBSystemViewer();