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
        this.purchaseType = 'onetime';
        this.sellingPlans = [];
        this.variantChangeUnsubscriber = undefined;
      }

      connectedCallback() {
        this.init();
        this.setupEventListeners();
        this.loadSellingPlans();
        
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
        
        this.switchTab(this.purchaseType);
      }

      setupEventListeners() {
        this.tabs.forEach(tab => {
          tab.addEventListener('click', (e) => {
            const tabType = e.currentTarget.dataset.tab;
            this.switchTab(tabType);
          });
        });

        const switchToSubscribeBtn = this.querySelector('[data-action="switch-to-subscribe"]');
        if (switchToSubscribeBtn) {
          switchToSubscribeBtn.addEventListener('click', () => {
            this.switchTab('subscribe');
          });
        }

        this.addEventListener('change', (e) => {
          if (e.target.classList.contains('loop-subscription-widget__radio')) {
            this.handleOptionChange(e.target);
          }
        });
      }

      switchTab(tabType) {
        this.tabs.forEach(tab => {
          const isActive = tab.dataset.tab === tabType;
          tab.classList.toggle('active', isActive);
          tab.setAttribute('aria-selected', isActive);
        });

        this.panels.forEach(panel => {
          const isActive = panel.dataset.panel === tabType;
          panel.classList.toggle('active', isActive);
        });

        this.purchaseType = tabType;
        
        if (tabType === 'onetime') {
          this.selectedSellingPlan = null;
          if (this.sellingPlanInput) {
            this.sellingPlanInput.value = '';
          }
          // No need to switch products - always using the same product
        }
        
        this.updateButtonPrice();
      }

      async loadSellingPlans() {
        try {
          this.showLoading();
          
          // First try to get selling plans from product JSON endpoint (most reliable)
          const plansFromJSON = await this.getSellingPlansFromLiquid();
          
          if (plansFromJSON.length > 0) {
            this.sellingPlans = plansFromJSON;
            this.renderSellingPlans();
            return;
          }
          
          // Fallback to API if Liquid data not available
          console.log('Loading selling plans from API for product:', this.productId);
          
          const allPlans = await this.fetchSellingPlansForProduct(this.productId);
          
          console.log('Total selling plans found:', allPlans.length);
          
          this.sellingPlans = allPlans;
          
          if (this.sellingPlans.length > 0) {
            this.renderSellingPlans();
          } else {
            console.warn('No selling plans found. Showing no subscriptions message.');
            this.showNoSubscriptions();
          }
        } catch (error) {
          console.error('Error loading selling plans:', error);
          this.showNoSubscriptions();
        }
      }

      async getSellingPlansFromLiquid() {
        const plans = [];
        
        // Get main product selling plans from JSON endpoint
        const mainProductData = this.querySelector('[data-selling-plans-data]');
        if (mainProductData) {
          const productHandle = mainProductData.dataset.productHandle;
          if (productHandle) {
            try {
              const response = await fetch(`/products/${productHandle}.js`);
              if (response.ok) {
                const product = await response.json();
                const variant = product.variants?.[0];
                
                console.log('Product JSON response:', product);
                console.log('Product has selling_plan_groups?', !!product.selling_plan_groups);
                console.log('selling_plan_groups:', product.selling_plan_groups);
                
                // Extract selling plans from product JSON
                // Shopify product JSON includes selling_plan_groups
                if (product.selling_plan_groups && product.selling_plan_groups.length > 0) {
                  product.selling_plan_groups.forEach(group => {
                    if (group.selling_plans && group.selling_plans.length > 0) {
                      group.selling_plans.forEach(plan => {
                        // Parse billing policy from plan options
                        const billingOption = plan.options?.[0];
                        const interval = billingOption?.name || 'MONTH';
                        const intervalCount = parseInt(billingOption?.values?.[0]) || 1;
                        
                        // Parse pricing policies
                        const pricingPolicies = [];
                        if (plan.price_adjustments && plan.price_adjustments.length > 0) {
                          plan.price_adjustments.forEach(adjustment => {
                            if (adjustment.value_type === 'percentage') {
                              pricingPolicies.push({
                                adjustmentType: 'PERCENTAGE',
                                adjustmentValue: { percentage: parseFloat(adjustment.value) || 0 }
                              });
                            } else {
                              // Fixed amount - value is typically in cents in Shopify JSON
                              const fixedAmount = parseFloat(adjustment.value) || 0;
                              pricingPolicies.push({
                                adjustmentType: 'FIXED_AMOUNT',
                                adjustmentValue: { 
                                  fixedValue: { 
                                    amount: fixedAmount / 100, // Convert cents to dollars for display
                                    currencyCode: 'USD' 
                                  } 
                                }
                              });
                            }
                          });
                        }
                        
                        plans.push({
                          id: plan.id.toString(),
                          gid: `gid://shopify/SellingPlan/${plan.id}`,
                          name: plan.name,
                          description: plan.description || '',
                          billingPolicy: {
                            interval: interval.toUpperCase(),
                            intervalCount: intervalCount
                          },
                          pricingPolicies: pricingPolicies,
                          productId: product.id.toString(),
                          variantId: variant?.id?.toString() || null,
                          variantPrice: variant ? variant.price : 0 // Product JSON prices are already in cents
                        });
                      });
                    }
                  });
                } else {
                  console.warn('No selling_plan_groups found in product JSON for:', productHandle);
                }
              } else {
                console.error('Failed to fetch product JSON for:', productHandle, 'Status:', response.status);
              }
            } catch (error) {
              console.error('Error fetching main product selling plans:', error);
            }
          } else {
            console.warn('No product handle found in [data-selling-plans-data] element');
          }
        } else {
          console.warn('No [data-selling-plans-data] element found');
        }
        
        console.log('Total plans found from Liquid/JSON:', plans.length);
        return plans;
      }

      async fetchSellingPlansForProduct(productId) {
        try {
          // First try to get product data from JSON endpoint
          const productResponse = await fetch(`/products/${productId}.js`);
          if (!productResponse.ok) {
            console.warn(`Failed to fetch product ${productId} from JSON endpoint`);
            return [];
          }
          
          const productData = await productResponse.json();
          const variant = productData.variants?.[0];
          const variantPrice = variant ? variant.price : 0;
          
          // Try GraphQL API for selling plans
          const query = `
            query getProduct($id: ID!) {
              product(id: $id) {
                id
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

          const response = await fetch('/api/2024-01/graphql.json', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: query,
              variables: {
                id: `gid://shopify/Product/${productId}`
              }
            })
          });

          if (!response.ok) {
            console.warn(`GraphQL API not available or requires authentication for product ${productId}`);
            return [];
          }

          const data = await response.json();
          
          if (data.errors) {
            console.error('GraphQL errors:', data.errors);
            return [];
          }

          const product = data.data?.product;
          if (!product) {
            console.warn(`No product data returned for product ${productId}`);
            return [];
          }

          const sellingPlanGroups = product.sellingPlanGroups?.edges || [];
          const plans = [];
          
          sellingPlanGroups.forEach(group => {
            const sellingPlans = group.node.sellingPlans.edges || [];
            sellingPlans.forEach(planEdge => {
              plans.push({
                id: planEdge.node.id.split('/').pop(),
                gid: planEdge.node.id,
                name: planEdge.node.name,
                description: planEdge.node.description,
                billingPolicy: planEdge.node.billingPolicy,
                pricingPolicies: planEdge.node.pricingPolicies,
                productId: productId,
                variantId: variant?.id || null,
                variantPrice: variantPrice
              });
            });
          });
          
          return plans;
        } catch (error) {
          console.error(`Error fetching selling plans for product ${productId}:`, error);
          return [];
        }
      }

      renderSellingPlans() {
        this.hideLoading();
        
        if (!this.optionsContainer) return;

        this.optionsContainer.innerHTML = '';

        const sortedPlans = [...this.sellingPlans].sort((a, b) => {
          const intervalA = a.billingPolicy?.intervalCount || 0;
          const intervalB = b.billingPolicy?.intervalCount || 0;
          return intervalA - intervalB;
        });

        sortedPlans.forEach((plan, index) => {
          const option = this.createSellingPlanOption(plan, index === 0);
          this.optionsContainer.appendChild(option);
        });

        if (sortedPlans.length > 0) {
          this.selectSellingPlan(sortedPlans[0], sortedPlans[0].productId, sortedPlans[0].variantId);
        }
      }

      createSellingPlanOption(plan, isDefault = false) {
        const option = document.createElement('div');
        option.className = `loop-subscription-widget__option${isDefault ? ' selected' : ''}`;
        option.dataset.sellingPlanId = plan.id;
        option.dataset.productId = plan.productId;
        option.dataset.variantId = plan.variantId;

        // Shopify product JSON prices from /products/[handle].js are in CENTS
        // e.g., 6500 = $65.00
        const basePriceCents = plan.variantPrice || 0;
        let subscriptionPrice = basePriceCents;
        let savings = 0;
        
        if (plan.pricingPolicies && plan.pricingPolicies.length > 0) {
          const policy = plan.pricingPolicies[0];
          const adjustmentType = policy.adjustmentType;
          const adjustmentValue = policy.adjustmentValue || {};
          
          console.log('Pricing policy:', { adjustmentType, adjustmentValue, basePriceCents });
          
          if (adjustmentType === 'PERCENTAGE' && adjustmentValue.percentage !== undefined) {
            const percentage = parseFloat(adjustmentValue.percentage);
            // Ensure percentage is reasonable (0-100%)
            if (percentage >= 0 && percentage <= 100) {
              const discount = Math.round((basePriceCents * percentage) / 100);
              subscriptionPrice = Math.max(0, basePriceCents - discount); // Ensure no negative prices
              savings = Math.min(100, Math.round(percentage)); // Cap savings at 100%
            } else {
              console.warn('Invalid percentage discount:', percentage, 'for plan:', plan.name);
            }
          } else if (adjustmentType === 'FIXED_AMOUNT' && adjustmentValue.fixedValue) {
            // Fixed amount is stored in dollars, convert to cents
            const fixedAmountDollars = parseFloat(adjustmentValue.fixedValue.amount);
            const discountAmountCents = Math.round(fixedAmountDollars * 100);
            subscriptionPrice = Math.max(0, basePriceCents - discountAmountCents); // Ensure no negative prices
            savings = Math.min(100, Math.round((discountAmountCents / basePriceCents) * 100)); // Cap savings at 100%
            console.log('Fixed discount (dollars):', fixedAmountDollars, 'Discount (cents):', discountAmountCents, 'Final price (cents):', subscriptionPrice);
          }
          
          console.log('Final subscription price:', subscriptionPrice, 'cents ($' + (subscriptionPrice / 100).toFixed(2) + ')');
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
              data-product-id="${plan.productId}"
              data-variant-id="${plan.variantId}"
            >
            <span class="loop-subscription-widget__radio-custom"></span>
            <div class="loop-subscription-widget__option-content">
              <div class="loop-subscription-widget__option-header">
                <span class="loop-subscription-widget__option-title">${frequencyText}</span>
                ${savings > 0 ? `<span class="loop-subscription-widget__savings-badge">Save ${savings}%</span>` : ''}
              </div>
              <div class="loop-subscription-widget__option-pricing">
                ${basePriceCents > subscriptionPrice ? `<span class="loop-subscription-widget__option-price-original">${this.formatPrice(basePriceCents)}</span>` : ''}
                <span class="loop-subscription-widget__option-price">${this.formatPrice(subscriptionPrice)}</span>
              </div>
              <div class="loop-subscription-widget__option-billing">${billingText}</div>
            </div>
          </label>
        `;

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
        
        // Convert months to days for display
        let days = intervalCount;
        if (unit === 'month' || unit === 'months') {
          days = intervalCount * 30; // Approximate 30 days per month
        } else if (unit === 'week' || unit === 'weeks') {
          days = intervalCount * 7;
        }
        
        // Check if this is the 3-unit plan (90 days typically)
        const planName = (plan.name || '').toLowerCase();
        const planDesc = (plan.description || '').toLowerCase();
        const isThreeUnitPlan = days >= 90 || planName.includes('3') || planName.includes('90') || planDesc.includes('3 unit');
        
        let text = `Delivery Every ${days} Days`;
        if (isThreeUnitPlan) {
          text += ` (3 units)`;
        }
        
        return text;
      }

      getBillingText(plan, price) {
        const intervalCount = plan.billingPolicy?.intervalCount || 1;
        const intervalUnit = plan.billingPolicy?.interval || 'MONTH';
        const unit = intervalUnit.toLowerCase();
        const formattedPrice = this.formatPrice(price);
        
        if (intervalCount === 1) {
          return `Billed ${unit === 'month' ? 'monthly' : unit === 'week' ? 'weekly' : unit + 'ly'}.`;
        }
        
        if (intervalCount === 3 && unit === 'month') {
          return `${formattedPrice} billed every 90 days.`;
        }
        
        return `${formattedPrice} billed every ${intervalCount} ${unit}${intervalCount > 1 ? 's' : ''}.`;
      }

      formatPrice(priceInCents) {
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
            this.selectSellingPlan(sellingPlan, this.productId, this.variantId);
          }
        } else if (radio.dataset.purchaseType === 'onetime') {
          this.selectedSellingPlan = null;
          if (this.sellingPlanInput) {
            this.sellingPlanInput.value = '';
          }
          // Reset quantity to 1 for one-time purchase
          const quantityInput = this.querySelector('[data-loop-quantity]');
          if (quantityInput) {
            quantityInput.value = 1;
          }
          this.updateButtonPrice();
        }

        this.querySelectorAll('.loop-subscription-widget__option').forEach(opt => {
          opt.classList.remove('selected');
        });
        if (radio.closest('.loop-subscription-widget__option')) {
          radio.closest('.loop-subscription-widget__option').classList.add('selected');
        }
      }

      selectSellingPlan(sellingPlan, productId, variantId) {
        this.selectedSellingPlan = sellingPlan;
        if (this.sellingPlanInput) {
          this.sellingPlanInput.value = sellingPlan.id;
        }
        
        // Determine quantity based on the selling plan
        // 90-day plans should have quantity 3
        const intervalCount = sellingPlan.billingPolicy?.intervalCount || 1;
        const intervalUnit = sellingPlan.billingPolicy?.interval || 'MONTH';
        const planName = (sellingPlan.name || '').toLowerCase();
        const planDesc = (sellingPlan.description || '').toLowerCase();
        
        // Check if this is the 3-unit plan (90 days typically)
        const isThreeUnitPlan = intervalCount >= 3 || 
                                 (intervalUnit === 'MONTH' && intervalCount === 3) ||
                                 planName.includes('3') || 
                                 planName.includes('90') || 
                                 planDesc.includes('3 unit');
        
        const quantity = isThreeUnitPlan ? 3 : 1;
        
        const quantityInput = this.querySelector('[data-loop-quantity]');
        if (quantityInput) {
          quantityInput.value = quantity;
        }
        
        // Remove fulfillment quantity property since we're using actual quantity now
        if (this.form) {
          const fulfillmentProp = this.form.querySelector('[name="properties[_fulfillment_quantity]"]');
          if (fulfillmentProp) {
            fulfillmentProp.remove();
          }
        }
        
        this.updateButtonPrice();
      }

      async switchToProduct(productId, variantId = null) {
        if (this.currentProductId === productId && this.currentVariantId === variantId) {
          return;
        }

        this.currentProductId = productId;
        
        if (!variantId) {
          try {
            const response = await fetch(`/products/${productId.split('/').pop()}.js`);
            const product = await response.json();
            variantId = product.variants[0].id;
          } catch (error) {
            console.error('Error fetching product:', error);
            return;
          }
        }
        
        this.currentVariantId = variantId;
        
        if (this.form) {
          this.form.action = `/cart/add`;
          
          if (this.variantInput) {
            this.variantInput.value = variantId;
          }
        }
        
        if (window.Shopify && Shopify.PaymentButton) {
          const paymentButtonContainer = this.querySelector('.shopify-payment-button');
          if (paymentButtonContainer) {
            paymentButtonContainer.innerHTML = '';
            Shopify.PaymentButton.init();
          }
        }
      }

      updateButtonPrice() {
        if (!this.buttonPriceElement) return;

        let price = '';
        
        if (this.purchaseType === 'subscribe' && this.selectedSellingPlan) {
            const pricingPolicies = this.selectedSellingPlan.pricingPolicies || [];
          const variantPriceCents = this.selectedSellingPlan.variantPrice || 0; // Already in cents from JSON
          
            if (pricingPolicies.length > 0) {
              const policy = pricingPolicies[0];
            let subscriptionPrice = variantPriceCents;
            const adjustmentType = policy.adjustmentType || '';
            const adjustmentValue = policy.adjustmentValue || {};
            
            if ((adjustmentType === 'PERCENTAGE' || adjustmentType === 'percentage') && adjustmentValue.percentage) {
              subscriptionPrice = subscriptionPrice - (subscriptionPrice * adjustmentValue.percentage / 100);
            } else if ((adjustmentType === 'FIXED_AMOUNT' || adjustmentType === 'fixed_amount') && adjustmentValue.fixedValue) {
              subscriptionPrice = subscriptionPrice - (adjustmentValue.fixedValue.amount * 100);
            } else if (adjustmentValue.percentage !== undefined) {
              subscriptionPrice = subscriptionPrice - (subscriptionPrice * adjustmentValue.percentage / 100);
            }
            price = this.formatPrice(subscriptionPrice);
          } else {
            price = this.formatPrice(variantPriceCents);
          }
        } else {
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
