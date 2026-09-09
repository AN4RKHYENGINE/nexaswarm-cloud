/**
 * NEXASWARM Unified Dashboard Application
 * Complete storefront, command center, and content generation system
 */

class NexaSwarmApp {
    constructor() {
        // API Configuration
        this.apiBase = localStorage.getItem('nexaswarm_api_base') || '';
        this.apiKey = localStorage.getItem('nexaswarm_api_key') || '';
        
        // Cart State
        this.cart = JSON.parse(localStorage.getItem('nexaswarm_cart') || '[]');
        
        // Products State
        this.products = [];
        this.currentFilter = 'all';
        this.currentSort = 'featured';
        
        // Session Stats
        this.stats = {
            revenue: 0,
            sessions: 0,
            aiRequests: 0,
            cacheHitRate: 0,
            productsCreated: 0,
            contentGenerated: 0,
            postsScheduled: 0
        };
        
        // Current Content
        this.currentContent = null;
        
        // Health Poll Timer
        this.healthPollTimer = null;
        
        // Charts
        this.revenueChart = null;
        this.productRevenueChart = null;
    }

    /**
     * Initialize the application
     */
    init() {
        // Check if authenticated
        if (!this.apiKey || !this.apiBase) {
            this.showAuthGate();
        } else {
            this.bootDashboard();
        }
        
        this.bindEvents();
    }

    /**
     * Show authentication gate
     */
    showAuthGate() {
        document.getElementById('authGate').style.display = 'flex';
        document.getElementById('mainDashboard').style.display = 'none';
    }

    /**
     * Boot the main dashboard
     */
    async bootDashboard() {
        document.getElementById('authGate').style.display = 'none';
        document.getElementById('mainDashboard').style.display = 'grid';
        
        // Load initial data
        await this.loadProducts();
        this.renderProducts();
        this.updateCartUI();
        this.startHealthPoll();
        this.initRevenueChart();
        
        // Populate config fields
        document.getElementById('configApiUrl').value = this.apiBase;
        document.getElementById('configApiKey').value = '***' + this.apiKey.slice(-4);
        
        this.toast('Connected to NEXASWARM', 'success');
    }

    /**
     * Bind all event listeners
     */
    bindEvents() {
        // Auth form
        document.getElementById('authForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.doAuth();
        });
        
        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            this.logout();
        });
        
        // Navigation tabs
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });
        
        // Filter chips
        document.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.currentFilter = e.currentTarget.dataset.filter;
                this.renderProducts();
            });
        });
        
        // Sort dropdown
        document.getElementById('sortProducts')?.addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.renderProducts();
        });
        
        // Cart button
        document.getElementById('cartButton')?.addEventListener('click', () => {
            this.toggleCart();
        });
        
        // Close cart
        document.getElementById('closeCart')?.addEventListener('click', () => {
            this.toggleCart();
        });
        
        // Checkout button
        document.getElementById('checkoutBtn')?.addEventListener('click', () => {
            this.checkout();
        });
        
        // Close modals
        document.getElementById('closeProductModal')?.addEventListener('click', () => {
            this.closeModal('productModal');
        });
        
        document.getElementById('closeCheckoutModal')?.addEventListener('click', () => {
            this.closeCheckout();
        });
        
        // Content form
        document.getElementById('contentForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.generateContent();
        });
        
        // YouTube form
        document.getElementById('youtubeForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.generateVideo();
        });
        
        // Product lab form
        document.getElementById('productLabForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.generateProduct();
        });
        
        // Social scheduler form
        document.getElementById('socialSchedulerForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.schedulePost();
        });
        
        // Character count for social content
        document.getElementById('socialContent')?.addEventListener('input', (e) => {
            document.getElementById('charCount').textContent = e.target.value.length;
        });
        
        // Checkout form
        document.getElementById('checkoutForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.processPayment();
        });
        
        // Content type buttons
        document.querySelectorAll('.content-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.content-type-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });
    }

    /**
     * Authenticate user
     */
    async doAuth() {
        const apiBaseUrl = document.getElementById('apiBaseUrl').value.trim();
        const apiKey = document.getElementById('apiKey').value.trim();
        
        if (!apiBaseUrl || !apiKey) {
            this.toast('Please enter both API base URL and API key', 'error');
            return;
        }
        
        // Temporarily set credentials
        this.apiBase = apiBaseUrl;
        this.apiKey = apiKey;
        
        // Test connection
        try {
            this.setLoading('authForm', true);
            await this.req('/health');
            
            // Save credentials
            localStorage.setItem('nexaswarm_api_base', apiBaseUrl);
            localStorage.setItem('nexaswarm_api_key', apiKey);
            
            // Boot dashboard
            await this.bootDashboard();
        } catch (error) {
            this.toast('Connection failed: ' + error.message, 'error');
            this.apiBase = '';
            this.apiKey = '';
        } finally {
            this.setLoading('authForm', false);
        }
    }

    /**
     * API request helper
     */
    async req(endpoint, options = {}) {
        const url = `${this.apiBase}${endpoint}`;
        const config = {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
                ...options.headers
            }
        };
        
        if (options.body) {
            config.body = JSON.stringify(options.body);
        }
        
        try {
            const response = await fetch(url, config);
            
            // Handle 401 Unauthorized
            if (response.status === 401) {
                this.toast('Authentication failed. Please reconnect.', 'error');
                this.logout();
                throw new Error('Unauthorized');
            }
            
            // Handle 503 Service Unavailable
            if (response.status === 503) {
                this.toast('Service temporarily unavailable', 'warning');
                throw new Error('Service unavailable');
            }
            
            // Handle other errors
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            if (error.message === 'Unauthorized') {
                throw error;
            }
            
            if (error.message === 'Failed to fetch' || error.message.includes('NetworkError')) {
                throw new Error('Network error. Check your connection.');
            }
            
            throw error;
        }
    }

    /**
     * Test API connection
     */
    async testConnection() {
        try {
            await this.req('/health');
            this.toast('Connection successful', 'success');
        } catch (error) {
            this.toast('Connection failed: ' + error.message, 'error');
        }
    }

    /**
     * Start health polling
     */
    startHealthPoll() {
        // Clear existing timer
        if (this.healthPollTimer) {
            clearInterval(this.healthPollTimer);
        }
        
        // Initial load
        this.loadHealth();
        
        // Poll every 10 seconds
        this.healthPollTimer = setInterval(() => {
            this.loadHealth();
        }, 10000);
    }

    /**
     * Load health status
     */
    async loadHealth() {
        try {
            const health = await this.req('/health');
            
            // Update health pills
            this.updateHealthPill('dbHealth', health.database || 'online');
            this.updateHealthPill('aiHealth', health.ai_router || 'online');
            this.updateHealthPill('revenueHealth', health.revenue || 'online');
            this.updateHealthPill('budgetHealth', health.budget || 'online');
            
            // Update system status
            if (health.database_connections !== undefined) {
                document.getElementById('dbConnections').textContent = health.database_connections;
            }
            if (health.active_workers !== undefined) {
                document.getElementById('activeWorkers').textContent = health.active_workers;
            }
            if (health.queue_size !== undefined) {
                document.getElementById('queueSize').textContent = health.queue_size;
            }
            if (health.memory_usage !== undefined) {
                document.getElementById('memoryUsage').textContent = `${health.memory_usage} MB`;
            }
            
        } catch (error) {
            // Set all to offline on error
            this.updateHealthPill('dbHealth', 'offline');
            this.updateHealthPill('aiHealth', 'offline');
            this.updateHealthPill('revenueHealth', 'offline');
            this.updateHealthPill('budgetHealth', 'offline');
        }
    }

    /**
     * Update health pill status
     */
    updateHealthPill(elementId, status) {
        const pill = document.getElementById(elementId);
        if (!pill) return;
        
        pill.classList.remove('offline', 'warning');
        
        if (status === 'offline' || status === 'error') {
            pill.classList.add('offline');
        } else if (status === 'warning' || status === 'degraded') {
            pill.classList.add('warning');
        }
    }

    /**
     * Load products from API or use demo data
     */
    async loadProducts() {
        try {
            const response = await this.req('/api/v1/products');
            this.products = response.products || response;
        } catch (error) {
            // Fallback to demo products
            this.products = [
                {
                    id: 1,
                    name: 'AI Content Mastery Guide',
                    description: 'Complete guide to creating viral content with AI tools',
                    type: 'ebooks',
                    price: 29.00,
                    original_price: 49.00,
                    icon: '📚',
                    features: ['50+ AI prompts', 'Content templates', 'Case studies', 'Bonus resources'],
                    pricing_tiers: {
                        solo: 29.00,
                        bundle: 67.00,
                        enterprise: 147.00
                    }
                },
                {
                    id: 2,
                    name: 'YouTube Automation Academy',
                    description: 'Build a profitable YouTube channel with AI automation',
                    type: 'courses',
                    price: 147.00,
                    original_price: 197.00,
                    icon: '🎓',
                    features: ['12 video modules', 'AI script templates', 'Thumbnail creator', 'Community access'],
                    pricing_tiers: {
                        solo: 147.00,
                        bundle: 297.00,
                        enterprise: 497.00
                    }
                },
                {
                    id: 3,
                    name: 'Social Media Content Templates',
                    description: '50+ proven templates for engaging social posts',
                    type: 'templates',
                    price: 19.00,
                    original_price: 29.00,
                    icon: '📄',
                    features: ['50+ templates', 'Platform-specific formats', 'Editable files', 'Monthly updates'],
                    pricing_tiers: {
                        solo: 19.00,
                        bundle: 39.00,
                        enterprise: 79.00
                    }
                },
                {
                    id: 4,
                    name: 'Complete Marketing Toolkit',
                    description: 'All-in-one toolkit for digital marketing success',
                    type: 'toolkits',
                    price: 67.00,
                    original_price: 97.00,
                    icon: '🛠️',
                    features: ['Analytics dashboard', 'Campaign planner', 'Email templates', 'SEO tools'],
                    pricing_tiers: {
                        solo: 67.00,
                        bundle: 127.00,
                        enterprise: 247.00
                    }
                },
                {
                    id: 5,
                    name: 'Pro Creator Community',
                    description: 'Exclusive access to tools, training, and community',
                    type: 'memberships',
                    price: 47.00,
                    original_price: 97.00,
                    icon: '👑',
                    features: ['Monthly training', 'Private community', 'Tool access', 'Weekly Q&A sessions'],
                    pricing_tiers: {
                        solo: 47.00,
                        bundle: 97.00,
                        enterprise: 197.00
                    }
                },
                {
                    id: 6,
                    name: 'Email Marketing Masterclass',
                    description: 'Convert subscribers into customers with proven strategies',
                    type: 'courses',
                    price: 97.00,
                    original_price: 147.00,
                    icon: '📧',
                    features: ['Email sequences', 'Copywriting formulas', 'Automation setup', 'Conversion tactics'],
                    pricing_tiers: {
                        solo: 97.00,
                        bundle: 177.00,
                        enterprise: 297.00
                    }
                },
                {
                    id: 7,
                    name: 'SEO Optimization Toolkit',
                    description: 'Rank higher and drive organic traffic',
                    type: 'toolkits',
                    price: 79.00,
                    original_price: 129.00,
                    icon: '🔍',
                    features: ['Keyword research', 'Content optimizer', 'Backlink tracker', 'Rank monitor'],
                    pricing_tiers: {
                        solo: 79.00,
                        bundle: 149.00,
                        enterprise: 279.00
                    }
                },
                {
                    id: 8,
                    name: 'Product Launch Playbook',
                    description: 'Launch your digital product with confidence',
                    type: 'ebooks',
                    price: 39.00,
                    original_price: 59.00,
                    icon: '🚀',
                    features: ['Launch checklist', 'Marketing plan', 'Sales page template', 'Email sequences'],
                    pricing_tiers: {
                        solo: 39.00,
                        bundle: 79.00,
                        enterprise: 149.00
                    }
                }
            ];
        }
    }

    /**
     * Render products in grid
     */
    renderProducts() {
        const grid = document.getElementById('productGrid');
        if (!grid) return;
        
        // Filter products
        let filtered = this.products;
        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(p => p.type === this.currentFilter);
        }
        
        // Sort products
        filtered.sort((a, b) => {
            switch (this.currentSort) {
                case 'price-low':
                    return a.price - b.price;
                case 'price-high':
                    return b.price - a.price;
                case 'newest':
                    return b.id - a.id;
                default:
                    return 0;
            }
        });
        
        // Render HTML
        grid.innerHTML = filtered.map(product => `
            <div class="product-card" data-product-id="${product.id}" data-category="${product.type}">
                <div class="product-image">
                    <div class="image-placeholder">${product.icon || '📦'}</div>
                </div>
                <span class="product-badge">${this.getTypeName(product.type)}</span>
                <h3 class="product-title">${this.escapeHtml(product.name)}</h3>
                <p class="product-description">${this.escapeHtml(product.description)}</p>
                <div class="product-pricing">
                    <span class="price-original">$${product.original_price.toFixed(2)}</span>
                    <span class="price-current">$${product.price.toFixed(2)}</span>
                </div>
                <button class="btn-add-cart" data-product-id="${product.id}">Add to Cart</button>
            </div>
        `).join('');
        
        // Bind click events
        grid.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('btn-add-cart')) {
                    const productId = parseInt(card.dataset.productId);
                    this.openProductModal(productId);
                }
            });
        });
        
        grid.querySelectorAll('.btn-add-cart').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const productId = parseInt(btn.dataset.productId);
                this.addToCart(productId);
            });
        });
    }

    /**
     * Get friendly type name
     */
    getTypeName(type) {
        const names = {
            'ebooks': 'eBook',
            'courses': 'Course',
            'templates': 'Template',
            'toolkits': 'Toolkit',
            'memberships': 'Membership'
        };
        return names[type] || type;
    }

    /**
     * Open product detail modal
     */
    openProductModal(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;
        
        const modal = document.getElementById('productModal');
        const modalBody = modal.querySelector('.modal-body');
        
        modalBody.innerHTML = `
            <div class="product-detail-image">
                <div class="detail-image-placeholder">${product.icon || '📦'}</div>
            </div>
            <div class="product-detail-info">
                <span class="detail-badge">${this.getTypeName(product.type)}</span>
                <h2 class="detail-title">${this.escapeHtml(product.name)}</h2>
                <p class="detail-description">${this.escapeHtml(product.description)}</p>
                <div class="detail-features">
                    <h4>What's Included:</h4>
                    <ul>
                        ${(product.features || []).map(f => `<li>${this.escapeHtml(f)}</li>`).join('')}
                    </ul>
                </div>
                <div class="pricing-tiers">
                    <h4>Choose Your Plan:</h4>
                    <div class="tier-options">
                        <div class="tier-option">
                            <input type="radio" name="tier" value="solo" id="tierSolo" checked>
                            <label for="tierSolo">
                                <span class="tier-name">Solo</span>
                                <span class="tier-price">$${product.pricing_tiers?.solo?.toFixed(2) || product.price.toFixed(2)}</span>
                            </label>
                        </div>
                        <div class="tier-option">
                            <input type="radio" name="tier" value="bundle" id="tierBundle">
                            <label for="tierBundle">
                                <span class="tier-name">Bundle</span>
                                <span class="tier-price">$${product.pricing_tiers?.bundle?.toFixed(2) || (product.price * 2).toFixed(2)}</span>
                                <span class="tier-save">Save 30%</span>
                            </label>
                        </div>
                        <div class="tier-option">
                            <input type="radio" name="tier" value="enterprise" id="tierEnterprise">
                            <label for="tierEnterprise">
                                <span class="tier-name">Enterprise</span>
                                <span class="tier-price">$${product.pricing_tiers?.enterprise?.toFixed(2) || (product.price * 3).toFixed(2)}</span>
                                <span class="tier-save">Best Value</span>
                            </label>
                        </div>
                    </div>
                </div>
                <div class="detail-actions">
                    <button class="btn-add-cart-large" onclick="app.addToCartFromModal(${productId})">Add to Cart</button>
                    <button class="btn-buy-now" onclick="app.buyNow(${productId})">Buy Now</button>
                </div>
            </div>
        `;
        
        modal.classList.add('active');
    }

    /**
     * Add to cart from modal with selected tier
     */
    addToCartFromModal(productId) {
        const selectedTier = document.querySelector('input[name="tier"]:checked')?.value || 'solo';
        this.addToCart(productId, selectedTier);
        this.closeModal('productModal');
    }

    /**
     * Buy now - add to cart and go to checkout
     */
    async buyNow(productId) {
        const selectedTier = document.querySelector('input[name="tier"]:checked')?.value || 'solo';
        this.addToCart(productId, selectedTier);
        this.closeModal('productModal');
        await new Promise(resolve => setTimeout(resolve, 100));
        this.checkout();
    }

    /**
     * Add product to cart
     */
    addToCart(productId, tier = 'solo') {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;
        
        // Check if already in cart
        const existing = this.cart.find(item => item.id === productId && item.tier === tier);
        if (existing) {
            this.toast('Item already in cart', 'warning');
            return;
        }
        
        // Add to cart
        const price = product.pricing_tiers?.[tier] || product.price;
        this.cart.push({
            id: productId,
            name: product.name,
            tier: tier,
            price: price,
            icon: product.icon
        });
        
        this.saveCart();
        this.updateCartUI();
        this.toast('Added to cart', 'success');
        this.log(`Product added to cart: ${product.name} (${tier})`);
    }

    /**
     * Remove from cart
     */
    removeFromCart(index) {
        const item = this.cart[index];
        this.cart.splice(index, 1);
        this.saveCart();
        this.updateCartUI();
        this.toast('Removed from cart', 'success');
        this.log(`Product removed from cart: ${item.name}`);
    }

    /**
     * Save cart to localStorage
     */
    saveCart() {
        localStorage.setItem('nexaswarm_cart', JSON.stringify(this.cart));
    }

    /**
     * Update cart UI
     */
    updateCartUI() {
        // Update badge
        const badge = document.getElementById('cartBadge');
        if (badge) {
            badge.textContent = this.cart.length;
        }
        
        // Update cart items
        const cartItems = document.getElementById('cartItems');
        if (!cartItems) return;
        
        if (this.cart.length === 0) {
            cartItems.innerHTML = '<p class="cart-empty">Your cart is empty</p>';
        } else {
            cartItems.innerHTML = this.cart.map((item, index) => `
                <div class="cart-item">
                    <div class="cart-item-image">${item.icon || '📦'}</div>
                    <div class="cart-item-info">
                        <div class="cart-item-title">${this.escapeHtml(item.name)}</div>
                        <div class="cart-item-price">$${item.price.toFixed(2)}</div>
                    </div>
                    <button class="cart-item-remove" onclick="app.removeFromCart(${index})">×</button>
                </div>
            `).join('');
        }
        
        // Update total
        const total = this.cart.reduce((sum, item) => sum + item.price, 0);
        const cartTotal = document.getElementById('cartTotal');
        if (cartTotal) {
            cartTotal.textContent = `$${total.toFixed(2)}`;
        }
    }

    /**
     * Toggle cart sidebar
     */
    toggleCart() {
        const sidebar = document.getElementById('cartSidebar');
        if (sidebar) {
            sidebar.classList.toggle('active');
        }
    }

    /**
     * Show checkout modal
     */
    checkout() {
        if (this.cart.length === 0) {
            this.toast('Your cart is empty', 'warning');
            return;
        }
        
        // Close cart sidebar
        document.getElementById('cartSidebar')?.classList.remove('active');
        
        // Populate checkout items
        const checkoutItems = document.getElementById('checkoutItems');
        if (checkoutItems) {
            checkoutItems.innerHTML = this.cart.map(item => `
                <div class="checkout-item">
                    <span class="checkout-item-name">${this.escapeHtml(item.name)} (${item.tier})</span>
                    <span class="checkout-item-price">$${item.price.toFixed(2)}</span>
                </div>
            `).join('');
        }
        
        // Update total
        const total = this.cart.reduce((sum, item) => sum + item.price, 0);
        const checkoutTotal = document.getElementById('checkoutTotal');
        if (checkoutTotal) {
            checkoutTotal.textContent = `$${total.toFixed(2)}`;
        }
        
        // Show modal
        const modal = document.getElementById('checkoutModal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    /**
     * Process payment
     */
    async processPayment() {
        const form = document.getElementById('checkoutForm');
        const email = form.querySelector('input[type="email"]').value;
        
        if (!email) {
            this.toast('Please enter your email', 'error');
            return;
        }
        
        try {
            this.setLoading('checkoutForm', true);
            
            const total = this.cart.reduce((sum, item) => sum + item.price, 0);
            const items = this.cart.map(item => ({
                product_id: item.id,
                tier: item.tier,
                price: item.price
            }));
            
            await this.req('/api/v1/payments/intent', {
                method: 'POST',
                body: {
                    email: email,
                    items: items,
                    total: total
                }
            });
            
            this.toast('Payment processed successfully!', 'success');
            this.stats.revenue += total;
            this.updateKPIs();
            this.log(`Payment processed: $${total.toFixed(2)}`);
            
            // Clear cart
            this.cart = [];
            this.saveCart();
            this.updateCartUI();
            
            // Close modal
            this.closeCheckout();
            
        } catch (error) {
            this.toast('Payment failed: ' + error.message, 'error');
        } finally {
            this.setLoading('checkoutForm', false);
        }
    }

    /**
     * Generate content
     */
    async generateContent() {
        const form = document.getElementById('contentForm');
        const topic = form.querySelector('input[type="text"]').value;
        const tone = form.querySelector('select:nth-of-type(1)').value;
        const length = form.querySelector('select:nth-of-type(2)').value;
        const instructions = form.querySelector('textarea').value;
        
        if (!topic) {
            this.toast('Please enter a topic', 'error');
            return;
        }
        
        try {
            this.setLoading('contentForm', true);
            
            const activeType = document.querySelector('.content-type-btn.active')?.dataset.type || 'blog';
            
            const response = await this.req('/api/v1/marketing/content', {
                method: 'POST',
                body: {
                    topic: topic,
                    platform: activeType,
                    tone: tone.toLowerCase(),
                    length: length,
                    audience: instructions
                }
            });
            
            this.currentContent = response.content || response.text || 'Content generated successfully';
            
            const outputContent = document.getElementById('generatedContent');
            if (outputContent) {
                outputContent.innerHTML = `<p>${this.escapeHtml(this.currentContent).replace(/\n/g, '<br>')}</p>`;
            }
            
            this.stats.contentGenerated++;
            this.stats.aiRequests++;
            this.updateKPIs();
            this.toast('Content generated successfully', 'success');
            this.log(`Content generated: ${activeType} - ${topic}`);
            
        } catch (error) {
            this.toast('Failed to generate content: ' + error.message, 'error');
        } finally {
            this.setLoading('contentForm', false);
        }
    }

    /**
     * Copy content to clipboard
     */
    copyContent() {
        if (!this.currentContent) {
            this.toast('No content to copy', 'warning');
            return;
        }
        
        navigator.clipboard.writeText(this.currentContent).then(() => {
            this.toast('Content copied to clipboard', 'success');
        }).catch(() => {
            this.toast('Failed to copy content', 'error');
        });
    }

    /**
     * Schedule current content
     */
    async scheduleCurrentContent() {
        if (!this.currentContent) {
            this.toast('No content to schedule', 'warning');
            return;
        }
        
        // Switch to social scheduler tab with content pre-filled
        this.switchTab('social');
        
        const textarea = document.querySelector('#socialTab textarea');
        if (textarea) {
            textarea.value = this.currentContent.substring(0, 280);
            document.getElementById('charCount').textContent = textarea.value.length;
        }
        
        this.toast('Content moved to Social Scheduler', 'success');
    }

    /**
     * Publish content immediately
     */
    async publishContent() {
        if (!this.currentContent) {
            this.toast('No content to publish', 'warning');
            return;
        }
        
        this.toast('Content published (demo)', 'success');
        this.log('Content published');
    }

    /**
     * Generate YouTube video
     */
    async generateVideo() {
        const form = document.getElementById('youtubeForm');
        const topic = form.querySelector('input[type="text"]:nth-of-type(1)').value;
        const audience = form.querySelector('input[type="text"]:nth-of-type(2)').value;
        const duration = form.querySelector('select:nth-of-type(1)').value;
        const style = form.querySelector('select:nth-of-type(2)').value;
        const keyPoints = form.querySelector('textarea').value;
        
        if (!topic) {
            this.toast('Please enter a video topic', 'error');
            return;
        }
        
        try {
            this.setLoading('youtubeForm', true);
            
            const response = await this.req('/api/v1/marketing/youtube/generate', {
                method: 'POST',
                body: {
                    topic: topic,
                    audience: audience,
                    duration: duration,
                    style: style,
                    key_points: keyPoints
                }
            });
            
            // Render title suggestions
            const titleSuggestions = document.getElementById('titleSuggestions');
            if (titleSuggestions && response.titles) {
                titleSuggestions.innerHTML = response.titles.map(title => 
                    `<div class="suggestion-item">${this.escapeHtml(title)}</div>`
                ).join('');
            }
            
            // Render description
            const videoDescription = document.getElementById('videoDescription');
            if (videoDescription && response.description) {
                videoDescription.innerHTML = `<p>${this.escapeHtml(response.description)}</p>`;
            }
            
            // Render tags
            const videoTags = document.getElementById('videoTags');
            if (videoTags && response.tags) {
                videoTags.innerHTML = response.tags.map(tag => 
                    `<span class="platform-tag">${this.escapeHtml(tag)}</span>`
                ).join('');
            }
            
            // Render script outline
            const scriptOutline = document.getElementById('scriptOutline');
            if (scriptOutline && response.script) {
                scriptOutline.innerHTML = `<p>${this.escapeHtml(response.script).replace(/\n/g, '<br>')}</p>`;
            }
            
            this.stats.contentGenerated++;
            this.stats.aiRequests++;
            this.updateKPIs();
            this.toast('YouTube package generated successfully', 'success');
            this.log(`YouTube package generated: ${topic}`);
            
        } catch (error) {
            this.toast('Failed to generate YouTube package: ' + error.message, 'error');
        } finally {
            this.setLoading('youtubeForm', false);
        }
    }

    /**
     * Generate product
     */
    async generateProduct() {
        const form = document.getElementById('productLabForm');
        const name = form.querySelector('input[type="text"]:nth-of-type(1)').value;
        const type = form.querySelector('select').value;
        const shortDesc = form.querySelector('input[type="text"]:nth-of-type(2)').value;
        const fullDesc = form.querySelector('textarea:nth-of-type(1)').value;
        
        if (!name) {
            this.toast('Please enter a product name', 'error');
            return;
        }
        
        try {
            this.setLoading('productLabForm', true);
            
            const response = await this.req('/api/v1/products/generate', {
                method: 'POST',
                body: {
                    type: type.toLowerCase(),
                    title: name,
                    audience: shortDesc,
                    pain_points: fullDesc
                }
            });
            
            // Update preview
            const preview = document.getElementById('productPreview');
            if (preview && response.product) {
                const product = response.product;
                preview.querySelector('.preview-title').textContent = product.name || name;
                preview.querySelector('.preview-description').textContent = product.description || shortDesc;
                preview.querySelector('.price-original').textContent = `$${(product.original_price || 99).toFixed(2)}`;
                preview.querySelector('.price-current').textContent = `$${(product.price || 49).toFixed(2)}`;
            }
            
            this.stats.productsCreated++;
            this.stats.aiRequests++;
            this.updateKPIs();
            this.toast('Product generated successfully', 'success');
            this.log(`Product generated: ${name}`);
            
        } catch (error) {
            this.toast('Failed to generate product: ' + error.message, 'error');
        } finally {
            this.setLoading('productLabForm', false);
        }
    }

    /**
     * Schedule social post
     */
    async schedulePost() {
        const form = document.getElementById('socialSchedulerForm');
        const platforms = Array.from(form.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        const content = form.querySelector('textarea').value;
        const date = form.querySelector('input[type="date"]').value;
        const time = form.querySelector('input[type="time"]').value;
        const hashtags = form.querySelector('input[type="text"]:nth-of-type(2)').value;
        
        if (platforms.length === 0) {
            this.toast('Please select at least one platform', 'error');
            return;
        }
        
        if (!content) {
            this.toast('Please enter post content', 'error');
            return;
        }
        
        try {
            this.setLoading('socialSchedulerForm', true);
            
            await this.req('/api/v1/marketing/schedule', {
                method: 'POST',
                body: {
                    platforms: platforms,
                    content: content,
                    scheduled_time: `${date}T${time}:00Z`,
                    hashtags: hashtags
                }
            });
            
            this.stats.postsScheduled++;
            this.updateKPIs();
            this.toast('Post scheduled successfully', 'success');
            this.log(`Post scheduled for ${platforms.join(', ')}`);
            
            // Reset form
            form.reset();
            document.getElementById('charCount').textContent = '0';
            
            // Reload scheduled posts
            this.loadScheduled();
            
        } catch (error) {
            this.toast('Failed to schedule post: ' + error.message, 'error');
        } finally {
            this.setLoading('socialSchedulerForm', false);
        }
    }

    /**
     * Load scheduled posts
     */
    async loadScheduled() {
        try {
            const response = await this.req('/api/v1/marketing/scheduled');
            const posts = response.posts || response;
            
            const container = document.getElementById('scheduledPosts');
            if (container && posts.length > 0) {
                container.innerHTML = posts.map(post => `
                    <div class="scheduled-item">
                        <div class="scheduled-date">${new Date(post.scheduled_time).toLocaleString()}</div>
                        <div class="scheduled-content">${this.escapeHtml(post.content)}</div>
                        <div class="scheduled-platforms">
                            ${post.platforms.map(p => `<span class="platform-tag">${p}</span>`).join('')}
                        </div>
                        <div class="scheduled-actions">
                            <button class="btn-icon">✏️</button>
                            <button class="btn-icon">🗑️</button>
                        </div>
                    </div>
                `).join('');
            }
        } catch (error) {
            // Silent fail - keep demo data
        }
    }

    /**
     * Initialize revenue chart
     */
    initRevenueChart() {
        const ctx = document.getElementById('revenueChart');
        if (!ctx) return;
        
        this.revenueChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Revenue',
                    data: [120, 190, 300, 250, 420, 380, 490],
                    borderColor: '#00f0ff',
                    backgroundColor: 'rgba(0, 240, 255, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)'
                        }
                    }
                }
            }
        });
        
        // Product revenue chart
        const ctx2 = document.getElementById('productRevenueChart');
        if (!ctx2) return;
        
        this.productRevenueChart = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: ['eBooks', 'Courses', 'Templates', 'Toolkits', 'Memberships'],
                datasets: [{
                    data: [300, 500, 200, 400, 350],
                    backgroundColor: [
                        '#00f0ff',
                        '#ff00a0',
                        '#ffd700',
                        '#00ff88',
                        '#ff4444'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.8)'
                        }
                    }
                }
            }
        });
    }

    /**
     * Load revenue data
     */
    async loadRevenue() {
        try {
            const response = await this.req('/api/v1/revenue');
            
            if (response.today !== undefined) {
                document.getElementById('revenueToday').textContent = `$${response.today.toFixed(2)}`;
            }
            if (response.week !== undefined) {
                document.getElementById('revenueWeek').textContent = `$${response.week.toFixed(2)}`;
            }
            if (response.month !== undefined) {
                document.getElementById('revenueMonth').textContent = `$${response.month.toFixed(2)}`;
            }
            if (response.all_time !== undefined) {
                document.getElementById('revenueAllTime').textContent = `$${response.all_time.toFixed(2)}`;
            }
            
            // Update chart if data provided
            if (response.chart_data && this.revenueChart) {
                this.revenueChart.data.datasets[0].data = response.chart_data;
                this.revenueChart.update();
            }
        } catch (error) {
            // Silent fail - keep demo data
        }
    }

    /**
     * Update KPI displays
     */
    updateKPIs() {
        document.getElementById('totalRevenue').textContent = `$${this.stats.revenue.toFixed(2)}`;
        document.getElementById('activeSessions').textContent = this.stats.sessions;
        document.getElementById('aiRequests').textContent = this.stats.aiRequests;
        document.getElementById('cacheHitRate').textContent = `${this.stats.cacheHitRate}%`;
    }

    /**
     * Switch tab
     */
    switchTab(tabName) {
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.tab === tabName) {
                item.classList.add('active');
            }
        });
        
        // Update tab panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        
        const activePanel = document.getElementById(`${tabName}Tab`);
        if (activePanel) {
            activePanel.classList.add('active');
        }
        
        // Load data for specific tabs
        if (tabName === 'revenue') {
            this.loadRevenue();
        } else if (tabName === 'social') {
            this.loadScheduled();
        }
    }

    /**
     * Logout
     */
    logout() {
        localStorage.removeItem('nexaswarm_api_base');
        localStorage.removeItem('nexaswarm_api_key');
        this.apiBase = '';
        this.apiKey = '';
        
        if (this.healthPollTimer) {
            clearInterval(this.healthPollTimer);
        }
        
        location.reload();
    }

    /**
     * Set loading state
     */
    setLoading(elementId, loading) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const button = element.querySelector('button[type="submit"]') || element.querySelector('.btn-primary');
        if (!button) return;
        
        if (loading) {
            button.disabled = true;
            button.dataset.originalText = button.textContent;
            button.textContent = 'Loading...';
        } else {
            button.disabled = false;
            button.textContent = button.dataset.originalText || button.textContent;
        }
    }

    /**
     * Show toast notification
     */
    toast(message, type = 'info') {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${this.escapeHtml(message)}</span>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Log activity
     */
    log(message) {
        const activityLog = document.getElementById('activityLog');
        if (!activityLog) return;
        
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.innerHTML = `
            <span class="activity-time">${timeStr}</span>
            <span class="activity-text">${this.escapeHtml(message)}</span>
        `;
        
        activityLog.insertBefore(item, activityLog.firstChild);
        
        // Keep only last 10 items
        while (activityLog.children.length > 10) {
            activityLog.removeChild(activityLog.lastChild);
        }
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Clear activity log
     */
    clearLog() {
        const activityLog = document.getElementById('activityLog');
        if (activityLog) {
            activityLog.innerHTML = '';
        }
    }

    /**
     * Close modal
     */
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
        }
    }

    /**
     * Close checkout modal
     */
    closeCheckout() {
        this.closeModal('checkoutModal');
        const form = document.getElementById('checkoutForm');
        if (form) {
            form.reset();
        }
    }
}

// Initialize app when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new NexaSwarmApp();
    app.init();
});
