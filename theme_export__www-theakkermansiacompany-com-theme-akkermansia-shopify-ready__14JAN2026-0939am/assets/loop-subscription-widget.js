if (!customElements.get('loop-subscription-widget')) {
  customElements.define(
    'loop-subscription-widget',
    class LoopSubscriptionWidget extends HTMLElement {
      constructor() {
        super();
        this.productId = this.dataset.productId;
        this.variantId = this.dataset.variantId;
        this.sectionId = this.dataset.sectionId;
        this.selectedSellingPlan = null;
        this.purchaseType = 'onetime'; // 'onetime' or 'subscribe'
        this.sellingPlans = [];
        this.variantChangeUnsubscriber = undefined;
      }

      connectedCallback() {
        this.init();
        this.setupEventListeners();
        this.loadSellingPlans();
        
        // Subscribe to variant changes
        if (typeof PUB_SUB_EVENTS !== 'undefined' || (window.PUB_SUB_EVENTS)) {
          const events = typeof PUB_SUB_EVENTS !== 'undefined' ? PUB_SUB_EVENTS : window.PUB_SUB_EVENTS;
          this.variantChangeUnsubscriber = subscribe(
            events.variantChange,
            this.handleVariantChange.bind(this)
          );
        }
      }

      disconnectedCallback() {
        if (this.variantChangeUnsubscriber) {
          this.variantChangeUnsubscriber();
        }
      }

      init() {
        // Initialize tab switching
        this.tabs = this.querySelectorAll('.loop-subscription-widget__tab');
        this.panels = this.querySelectorAll('.loop-subscription-widget__panel');
        this.optionsContainer = this.querySelector('.loop-subscription-widget__options');
        this.loadingElement = this.querySelector('.loop-subscription-widget__loading');
        this.noSubscriptionsElement = this.querySelector('.loop-subscription-widget__no-subscriptions');
        this.addToCartButton = this.querySelector('.loop-subscription-widget__add-to-cart');
        this.buttonPriceElement = this.querySelector('[data-button-price]');
        this.form = this.querySelector('[data-loop-form]') || this.querySelector('form.loop-subscription-widget__form');
        this.variantInput = this.querySelector('[data-variant-input]');
        this.sellingPlanInput = this.querySelector('[data-selling-plan-input]');
        
        // Set initial tab
        this.switchTab(this.purchaseType);
      }

      setupEventListeners() {
        // Tab switching
        this.tabs.forEach(tab => {
          tab.addEventListener('click', (e) => {
            const tabType = e.currentTarget.dataset.tab;
            this.switchTab(tabType);
          });
        });

        // Switch to subscribe button
        const switchToSubscribeBtn = this.querySelector('[data-action="switch-to-subscribe"]');
        if (switchToSubscribeBtn) {
          switchToSubscribeBtn.addEventListener('click', () => {
            this.switchTab('subscribe');
          });
        }

        // Radio button changes
        this.addEventListener('change', (e) => {
          if (e.target.classList.contains('loop-subscription-widget__radio')) {
            this.handleOptionChange(e.target);
          }
        });
      }

      switchTab(tabType) {
        // Update tabs
        this.tabs.forEach(tab => {
          const isActive = tab.dataset.tab === tabType;
          tab.classList.toggle('active', isActive);
          tab.setAttribute('aria-selected', isActive);
        });

        // Update panels
        this.panels.forEach(panel => {
          const isActive = panel.dataset.panel === tabType;
          panel.classList.toggle('active', isActive);
        });

        this.purchaseType = tabType;
        
        // Clear selling plan selection when switching to one-time
        if (tabType === 'onetime') {
          this.selectedSellingPlan = null;
          if (this.sellingPlanInput) {
            this.sellingPlanInput.value = '';
          }
        }
        
        this.updateButtonPrice();
      }

      async loadSellingPlans() {
        try {
          this.showLoading();
          
          // Fetch selling plans using Shopify's Storefront API (GraphQL)
          const query = `
            query getProduct($id: ID!) {
              product(id: $id) {
                sellingPlanGroups(first: 10) {
                  edges {
                    node {
                      id
                      name
                      options {
                        name
                        values
                      }
                      sellingPlans(first: 10) {
                        edges {
                          node {
                            id
                            name
                            description
                            billingPolicy {
                              interval
                              intervalCount
                            }
                            pricingPolicies {
                              ... on SellingPlanFixedPricingPolicy {
                                adjustmentType
                                adjustmentValue {
                                  ... on SellingPlanPricingPolicyPercentageValue {
                                    percentage
                                  }
                                  ... on SellingPlanPricingPolicyFixedValue {
                                    fixedValue {
                                      amount
                                      currencyCode
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          `;

          // Use Shopify's Storefront API endpoint
          const response = await fetch('/api/2024-01/graphql.json', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: query,
              variables: {
                id: `gid://shopify/Product/${this.productId}`
              }
            })
          });

          if (!response.ok) {
            throw new Error('Failed to fetch selling plans');
          }

          const data = await response.json();
          
          if (data.errors) {
            console.error('GraphQL errors:', data.errors);
            throw new Error('GraphQL query failed');
          }

          // Extract selling plans
          const sellingPlanGroups = data.data?.product?.sellingPlanGroups?.edges || [];
          const allSellingPlans = [];
          
          sellingPlanGroups.forEach(group => {
            const sellingPlans = group.node.sellingPlans.edges || [];
            sellingPlans.forEach(planEdge => {
              allSellingPlans.push({
                id: planEdge.node.id.split('/').pop(), // Extract numeric ID
                gid: planEdge.node.id,
                name: planEdge.node.name,
                description: planEdge.node.description,
                billingPolicy: planEdge.node.billingPolicy,
                pricingPolicies: planEdge.node.pricingPolicies
              });
            });
          });
          
          this.sellingPlans = allSellingPlans;
          
          if (this.sellingPlans.length > 0) {
            this.renderSellingPlans();
          } else {
            this.showNoSubscriptions();
          }
        } catch (error) {
          console.error('Error loading selling plans:', error);
          this.showNoSubscriptions();
        }
      }

      renderSellingPlans() {
        this.hideLoading();
        
        if (!this.optionsContainer) return;

        // Clear existing options
        this.optionsContainer.innerHTML = '';

        // Sort selling plans by interval count
        const sortedPlans = [...this.sellingPlans].sort((a, b) => {
          const intervalA = a.billingPolicy?.intervalCount || 0;
          const intervalB = b.billingPolicy?.intervalCount || 0;
          return intervalA - intervalB;
        });

        sortedPlans.forEach((plan, index) => {
          const option = this.createSellingPlanOption(plan, index === 0);
          this.optionsContainer.appendChild(option);
        });

        // Select first plan by default
        if (sortedPlans.length > 0) {
          this.selectSellingPlan(sortedPlans[0]);
        }
      }

      createSellingPlanOption(plan, isDefault = false) {
        const option = document.createElement('div');
        option.className = `loop-subscription-widget__option${isDefault ? ' selected' : ''}`;
        option.dataset.sellingPlanId = plan.id;

        // Get variant price from DOM
        const variantPriceElement = this.querySelector('[data-variant-price]');
        const basePrice = variantPriceElement ? parseInt(variantPriceElement.dataset.variantPrice) : 0;
        
        // Calculate subscription price from pricing policies
        let subscriptionPrice = basePrice;
        let savings = 0;
        
        if (plan.pricingPolicies && plan.pricingPolicies.length > 0) {
          const policy = plan.pricingPolicies[0];
          if (policy.adjustmentType === 'PERCENTAGE' && policy.adjustmentValue.percentage) {
            const discount = (basePrice * policy.adjustmentValue.percentage) / 100;
            subscriptionPrice = basePrice - discount;
            savings = Math.round(policy.adjustmentValue.percentage);
          } else if (policy.adjustmentType === 'FIXED_AMOUNT' && policy.adjustmentValue.fixedValue) {
            const discountAmount = policy.adjustmentValue.fixedValue.amount * 100; // Convert to cents
            subscriptionPrice = basePrice - discountAmount;
            savings = Math.round((discountAmount / basePrice) * 100);
          }
        }

        const frequencyText = this.getFrequencyText(plan);
        const billingText = this.getBillingText(plan, subscriptionPrice);

        option.innerHTML = `
          <label class="loop-subscription-widget__radio-label">
            <input 
              type="radio" 
              name="loop-selling-plan-${this.sectionId}" 
              value="${plan.id}"
              class="loop-subscription-widget__radio"
              ${isDefault ? 'checked' : ''}
              data-selling-plan-id="${plan.id}"
            >
            <span class="loop-subscription-widget__radio-custom"></span>
            <div class="loop-subscription-widget__option-content">
              <div class="loop-subscription-widget__option-header">
                <span class="loop-subscription-widget__option-title">${frequencyText}</span>
                ${savings > 0 ? `<span class="loop-subscription-widget__savings-badge">Save ${savings}%</span>` : ''}
              </div>
              <div class="loop-subscription-widget__option-pricing">
                ${basePrice > subscriptionPrice ? `<span class="loop-subscription-widget__option-price-original">${this.formatPrice(basePrice)}</span>` : ''}
                <span class="loop-subscription-widget__option-price">${this.formatPrice(subscriptionPrice)}</span>
              </div>
              <div class="loop-subscription-widget__option-billing">${billingText}</div>
            </div>
          </label>
        `;

        // Add click handler to select option
        option.addEventListener('click', (e) => {
          if (!e.target.closest('input')) {
            const radio = option.querySelector('input[type="radio"]');
            if (radio) {
              radio.checked = true;
              this.handleOptionChange(radio);
            }
          }
        });

        return option;
      }

      getFrequencyText(plan) {
        const intervalCount = plan.billingPolicy?.intervalCount || 1;
        const intervalUnit = plan.billingPolicy?.interval || 'MONTH';
        const unit = intervalUnit.toLowerCase();
        
        if (intervalCount === 1) {
          return `1-${unit.charAt(0).toUpperCase() + unit.slice(1)} supply`;
        }
        return `${intervalCount}-${unit.charAt(0).toUpperCase() + unit.slice(1)} supply`;
      }

      getBillingText(plan, price) {
        const intervalCount = plan.billingPolicy?.intervalCount || 1;
        const intervalUnit = plan.billingPolicy?.interval || 'MONTH';
        const unit = intervalUnit.toLowerCase();
        const formattedPrice = this.formatPrice(price);
        
        if (intervalCount === 1) {
          return `Billed ${unit === 'month' ? 'monthly' : unit === 'week' ? 'weekly' : unit + 'ly'}.`;
        }
        
        return `${formattedPrice} billed every ${intervalCount} ${unit}${intervalCount > 1 ? 's' : ''}.`;
      }

      formatPrice(priceInCents) {
        // Convert cents to dollars
        const priceInDollars = priceInCents / 100;
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(priceInDollars);
      }

      handleOptionChange(radio) {
        if (radio.dataset.sellingPlanId) {
          const sellingPlan = this.sellingPlans.find(sp => sp.id === radio.dataset.sellingPlanId);
          if (sellingPlan) {
            this.selectSellingPlan(sellingPlan);
          }
        } else if (radio.dataset.purchaseType === 'onetime') {
          this.selectedSellingPlan = null;
          if (this.sellingPlanInput) {
            this.sellingPlanInput.value = '';
          }
          this.updateButtonPrice();
        }

        // Update visual selection
        this.querySelectorAll('.loop-subscription-widget__option').forEach(opt => {
          opt.classList.remove('selected');
        });
        if (radio.closest('.loop-subscription-widget__option')) {
          radio.closest('.loop-subscription-widget__option').classList.add('selected');
        }
      }

      selectSellingPlan(sellingPlan) {
        this.selectedSellingPlan = sellingPlan;
        if (this.sellingPlanInput) {
          this.sellingPlanInput.value = sellingPlan.id;
        }
        this.updateButtonPrice();
      }

      updateButtonPrice() {
        if (!this.buttonPriceElement) return;

        let price = '';
        
        if (this.purchaseType === 'subscribe' && this.selectedSellingPlan) {
          // Calculate subscription price
          const variantPriceElement = this.querySelector('[data-variant-price]');
          if (variantPriceElement) {
            const basePrice = parseInt(variantPriceElement.dataset.variantPrice);
            const pricingPolicies = this.selectedSellingPlan.pricingPolicies || [];
            if (pricingPolicies.length > 0) {
              const policy = pricingPolicies[0];
              let subscriptionPrice = basePrice;
              if (policy.adjustmentType === 'PERCENTAGE' && policy.adjustmentValue.percentage) {
                subscriptionPrice = basePrice - (basePrice * policy.adjustmentValue.percentage / 100);
              } else if (policy.adjustmentType === 'FIXED_AMOUNT' && policy.adjustmentValue.fixedValue) {
                subscriptionPrice = basePrice - (policy.adjustmentValue.fixedValue.amount * 100);
              }
              price = this.formatPrice(subscriptionPrice);
            }
          }
        } else {
          // Get one-time price from variant
          const onetimePriceElement = this.querySelector('[data-onetime-price]');
          if (onetimePriceElement) {
            price = onetimePriceElement.dataset.onetimePrice;
          }
        }

        if (price) {
          this.buttonPriceElement.textContent = price;
        }
      }

      handleVariantChange(event) {
        if (event.data && event.data.sectionId === this.sectionId) {
          const newVariantId = event.data.variantId || event.data.variant?.id;
          if (newVariantId && newVariantId !== this.variantId) {
            this.variantId = newVariantId;
            if (this.variantInput) {
              this.variantInput.value = newVariantId;
            }
            this.loadSellingPlans();
            this.updateButtonPrice();
          }
        }
      }

      showLoading() {
        if (this.loadingElement) {
          this.loadingElement.classList.remove('hidden');
        }
        if (this.noSubscriptionsElement) {
          this.noSubscriptionsElement.classList.add('hidden');
        }
        if (this.optionsContainer) {
          this.optionsContainer.innerHTML = '';
        }
      }

      hideLoading() {
        if (this.loadingElement) {
          this.loadingElement.classList.add('hidden');
        }
      }

      showNoSubscriptions() {
        this.hideLoading();
        if (this.noSubscriptionsElement) {
          this.noSubscriptionsElement.classList.remove('hidden');
        }
      }
    }
  );
}

// Helper functions (if not already defined)
if (typeof subscribe === 'undefined') {
  window.subscribe = function(eventName, callback) {
    if (!window.subscribers) window.subscribers = {};
    if (!window.subscribers[eventName]) window.subscribers[eventName] = [];
    window.subscribers[eventName].push(callback);
    return function unsubscribe() {
      window.subscribers[eventName] = window.subscribers[eventName].filter(cb => cb !== callback);
    };
  };
}

if (typeof publish === 'undefined') {
  window.publish = function(eventName, data) {
    if (window.subscribers && window.subscribers[eventName]) {
      window.subscribers[eventName].forEach(callback => callback(data));
    }
  };
}
