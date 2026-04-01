const cartKey = "felly_best_cart";
const userKey = "felly_best_user";
const adminPassKey = "felly_best_admin_passcode";
const lastReceiptKey = "felly_best_last_receipt_order";
const whatsappOrderNumber = "2349037268638";

const getCart = () => {
  const raw = localStorage.getItem(cartKey);
  return raw ? JSON.parse(raw) : [];
};

const saveCart = (cart) => {
  localStorage.setItem(cartKey, JSON.stringify(cart));
};

const getUserProfile = () => {
  const raw = localStorage.getItem(userKey);
  return raw ? JSON.parse(raw) : null;
};

const saveUserProfile = (profile) => {
  localStorage.setItem(userKey, JSON.stringify(profile));
};

const clearUserProfile = () => {
  localStorage.removeItem(userKey);
};

const getLastReceiptOrder = () => {
  const raw = localStorage.getItem(lastReceiptKey);
  return raw ? JSON.parse(raw) : null;
};

const saveLastReceiptOrder = (order) => {
  localStorage.setItem(lastReceiptKey, JSON.stringify(order || {}));
};

const getAdminPasscode = () => sessionStorage.getItem(adminPassKey) || "";
const saveAdminPasscode = (passcode) => sessionStorage.setItem(adminPassKey, passcode);
const clearAdminPasscode = () => sessionStorage.removeItem(adminPassKey);

const hasCompleteProfile = (profile) =>
  Boolean(profile && profile.name && profile.phone && profile.address);

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString()}`;

const toAbsoluteImageUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (window.location.protocol === "file:") return raw;

  try {
    return new URL(raw, window.location.origin).href;
  } catch (_) {
    return raw;
  }
};

const isLocalhost =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

const getCurrentPageName = () => {
  const pathname = String(window.location.pathname || "/");
  const parts = pathname.split("/").filter(Boolean);
  const last = (parts[parts.length - 1] || "index.html").toLowerCase();
  return last || "index.html";
};

const enforceCustomerAccessGate = () => {
  const protectedPages = new Set(["home.html", "shop.html", "cart.html"]);
  const currentPage = getCurrentPageName();
  if (!protectedPages.has(currentPage)) return true;

  const profile = getUserProfile();
  if (hasCompleteProfile(profile)) return true;

  window.location.href = "index.html";
  return false;
};

const enforceAdminAccessGate = async () => {
  return true;
};

const buildApiBases = () => {
  if (window.location.protocol === "file:") {
    return ["http://localhost:3000", "http://localhost:3001"];
  }

  const bases = [window.location.origin];
  if (isLocalhost) {
    bases.push("http://localhost:3000", "http://localhost:3001");
  }
  return [...new Set(bases)];
};

const apiRequest = async (path, options = {}) => {
  const bases = buildApiBases();
  let response;
  let lastError;

  for (const base of bases) {
    try {
      response = await fetch(`${base}/api${path}`, {
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        },
        ...options
      });
    } catch (_) {
      lastError = new Error("Backend unreachable. Please ensure the server is running.");
      continue;
    }

    const isLikelyWrongLocalHost =
      isLocalhost &&
      window.location.origin === base &&
      !["3000", "3001", "8888"].includes(window.location.port) &&
      response.status === 404;

    if (isLikelyWrongLocalHost) {
      continue;
    }
    break;
  }

  if (!response) {
    throw lastError || new Error("Backend unreachable. Please ensure the server is running.");
  }

  let payload = {};
  try {
    const text = await response.text();
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      // If response is not JSON (e.g., HTML error), use text as error
      payload = { error: text || response.statusText };
    }
  } catch (err) {
    payload = { error: "Invalid server response" };
  }

  if (!response.ok) {
    const message = payload.error || `Request failed (${response.status})`;
    console.error("API Request Error:", payload);
    throw new Error(message);
  }

  return payload;
};

const updateCartCount = () => {
  const cart = getCart();
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = count;
  });
};

const addToCart = (item) => {
  const cart = getCart();
  const existing = cart.find((entry) => entry.id === item.id);
  if (existing) {
    existing.qty += item.qty;
  } else {
    cart.push(item);
  }
  saveCart(cart);
  updateCartCount();
};

const setupNavToggle = () => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    nav.classList.toggle("open");
  });
};

const setupReveal = () => {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  items.forEach((item) => observer.observe(item));
};

const setupAddButtons = () => {
  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".product-card");
      const qtyInput = card.querySelector(".qty-input");
      const qty = Math.max(1, Number(qtyInput.value || 1));
      const item = {
        id: button.dataset.id,
        name: button.dataset.name,
        price: Number(button.dataset.price),
        qty,
        image: card.querySelector("img")?.getAttribute("src") || ""
      };
      addToCart(item);
      button.textContent = "Added!";
      setTimeout(() => {
        button.textContent = "Add to cart";
      }, 1200);
    });
  });
};

const setupShopHeroCarousel = () => {
  const currentPage = getCurrentPageName();
  if (currentPage !== "shop.html") return;

  const hero = document.querySelector("[data-shop-hero]");
  const backdrop = hero?.querySelector(".page-hero-backdrop");
  const dots = hero ? [...hero.querySelectorAll("[data-hero-dot]")] : [];
  if (!hero || !backdrop || !dots.length) return;

  const slides = [
    "images/pexels-panduru-10652321.jpg",
    "images/pexels-daniel-dan-7543155.webp",
    "images/pexels-ganajp-18328392.jpg"
  ];

  let activeIndex = 0;
  let intervalId;

  const renderSlide = (nextIndex) => {
    activeIndex = (nextIndex + slides.length) % slides.length;
    hero.style.setProperty("--hero-image", `url("${slides[activeIndex]}")`);

    dots.forEach((dot, index) => {
      const isActive = index === activeIndex;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-pressed", String(isActive));
    });
  };

  const restartAutoPlay = () => {
    window.clearInterval(intervalId);
    intervalId = window.setInterval(() => {
      renderSlide(activeIndex + 1);
    }, 4500);
  };

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      renderSlide(index);
      restartAutoPlay();
    });
  });

  hero.addEventListener("mouseenter", () => window.clearInterval(intervalId));
  hero.addEventListener("mouseleave", restartAutoPlay);

  renderSlide(0);
  restartAutoPlay();
};

const setupSiteBackgroundCarousel = () => {
  const currentPage = getCurrentPageName();
  if (currentPage !== "home.html") {
    document.body.style.removeProperty("--site-bg-image");
    return;
  }

  const slides = [
    "images/pexels-panduru-10652321.jpg",
    "images/pexels-daniel-dan-7543155.webp",
    "images/pexels-ganajp-18328392.jpg"
  ];

  if (!slides.length) return;

  let activeIndex = 0;

  const renderSlide = (nextIndex) => {
    activeIndex = (nextIndex + slides.length) % slides.length;
    document.body.style.setProperty("--site-bg-image", `url("${slides[activeIndex]}")`);
  };

  renderSlide(0);

  window.setInterval(() => {
    renderSlide(activeIndex + 1);
  }, 5000);
};

const updateTotals = (cart) => {
  const subtotalEl = document.querySelector("[data-subtotal]");
  const deliveryEl = document.querySelector("[data-delivery]");
  const totalEl = document.querySelector("[data-total]");
  if (!subtotalEl || !deliveryEl || !totalEl) return;

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const delivery = subtotal > 0 ? 0 : 0;
  const total = subtotal + delivery;

  subtotalEl.textContent = formatNaira(subtotal);
  deliveryEl.textContent = formatNaira(delivery);
  totalEl.textContent = formatNaira(total);
};

const renderCart = () => {
  const tableBody = document.querySelector("[data-cart-table] tbody");
  if (!tableBody) return;

  const cart = getCart();
  tableBody.innerHTML = "";

  if (!cart.length) {
    tableBody.innerHTML = "<tr><td colspan=\"5\">Your cart is empty. Visit the shop to add items.</td></tr>";
    updateTotals(cart);
    return;
  }

  cart.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="Item">
        <div class="cart-item-cell">
          <div class="cart-item-thumb-wrap">
            ${item.image ? `<img src="${item.image}" alt="${item.name}" class="cart-item-thumb" loading="lazy" decoding="async" />` : '<div class="cart-item-thumb cart-item-thumb-placeholder">No image</div>'}
          </div>
          <span>${item.name}</span>
        </div>
      </td>
      <td data-label="Price">${formatNaira(item.price)}</td>
      <td data-label="Quantity">
        <input type="number" min="1" value="${item.qty}" data-qty="${item.id}" class="qty-input" />
      </td>
      <td data-label="Total">${formatNaira(item.price * item.qty)}</td>
      <td data-label="Action"><button class="remove-btn" data-remove="${item.id}">Remove</button></td>
    `;
    tableBody.appendChild(row);
  });

  tableBody.querySelectorAll("[data-qty]").forEach((input) => {
    input.addEventListener("change", () => {
      const qty = Math.max(1, Number(input.value || 1));
      const cartItems = getCart();
      const item = cartItems.find((entry) => entry.id === input.dataset.qty);
      if (item) {
        item.qty = qty;
        saveCart(cartItems);
        renderCart();
        updateCartCount();
      }
    });
  });

  tableBody.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const cartItems = getCart().filter((entry) => entry.id !== button.dataset.remove);
      saveCart(cartItems);
      renderCart();
      updateCartCount();
    });
  });

  updateTotals(cart);
};

const showStatus = (message) => {
  const status = document.querySelector("[data-status]");
  if (!status) return;
  status.textContent = message;
  status.classList.add("show");
  setTimeout(() => {
    status.classList.remove("show");
  }, 3000);
};

const updateReceiptButtonState = () => {
  const receiptBtn = document.querySelector("[data-receipt]");
  if (!receiptBtn) return;
  const completedOrder = getLastReceiptOrder();
  const hasCompletedOrder = Boolean(
    completedOrder && Array.isArray(completedOrder.items) && completedOrder.items.length
  );
  receiptBtn.disabled = !hasCompletedOrder;
  receiptBtn.setAttribute("aria-disabled", String(!hasCompletedOrder));
  receiptBtn.title = hasCompletedOrder
    ? "Download receipt from your last checkout"
    : "Complete checkout before downloading receipt";
};

const buildOrderWhatsAppLink = (order, purchaser) => {
  const safeOrder = order || {};
  const safePurchaser = purchaser || {};
  const items = Array.isArray(safeOrder.items) ? safeOrder.items : [];
  const subtotal = Number(safeOrder.subtotal || 0);
  const delivery = Number(safeOrder.delivery || 0);
  const total = Number(safeOrder.total || 0);

  const lines = [
    "Hello Felly-Best Foods, new order received:",
    `Order ID: ${safeOrder.id || "N/A"}`,
    `Date: ${safeOrder.date || new Date().toLocaleString()}`,
    "",
    "Customer details:",
    `Name: ${safePurchaser.name || "N/A"}`,
    `Phone: ${safePurchaser.phone || "N/A"}`,
    `Address: ${safePurchaser.address || "N/A"}`,
    "",
    "Items:"
  ];

  if (items.length) {
    items.forEach((item) => {
      const name = item.name || "Item";
      const qty = Number(item.qty || 0);
      const price = Number(item.price || 0);
      const image = toAbsoluteImageUrl(item.image || item.image_url || "");
      lines.push(`- ${name} x${qty} @ ${formatNaira(price)} = ${formatNaira(price * qty)}`);
      if (image) {
        lines.push(`  Image: ${image}`);
      }
    });
  } else {
    lines.push("- No items listed");
  }

  lines.push("");
  lines.push(`Subtotal: ${formatNaira(subtotal)}`);
  lines.push(`Delivery: ${formatNaira(delivery)}`);
  lines.push(`Total: ${formatNaira(total)}`);

  const message = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${whatsappOrderNumber}?text=${message}`;
};

const drawRoundedRect = (ctx, x, y, width, height, radius) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const wrapText = (ctx, text, maxWidth) => {
  const words = String(text).split(" ");
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });

  if (current) lines.push(current);
  return lines;
};

const downloadReceiptPng = () => {
  const completedOrder = getLastReceiptOrder();
  const cart = Array.isArray(completedOrder?.items) ? completedOrder.items : [];
  if (!cart.length) {
    showStatus("Complete checkout before downloading a receipt.");
    return;
  }

  const purchaser = completedOrder.purchaser || getUserProfile() || {};
  const subtotal = Number(
    completedOrder.subtotal || cart.reduce((sum, item) => sum + item.price * item.qty, 0)
  );
  const delivery = Number(completedOrder.delivery || 0);
  const total = Number(completedOrder.total || subtotal + delivery);
  const createdAt = completedOrder.date || new Date().toLocaleString();

  const canvasWidth = 1200;
  const left = 100;
  const right = canvasWidth - 100;
  const amountX = canvasWidth - 280;
  const lineHeight = 30;

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) {
    showStatus("Unable to generate receipt image.");
    return;
  }

  measureCtx.font = "500 25px Nunito, sans-serif";
  const addressLines = wrapText(measureCtx, `Address: ${purchaser.address || "N/A"}`, right - left);

  measureCtx.font = "600 23px Nunito, sans-serif";
  const itemLineGroups = cart.map((item) =>
    wrapText(measureCtx, `${item.name} x${item.qty} @ ${formatNaira(item.price)}`, canvasWidth - 460)
  );

  const infoStartY = 230;
  const infoRows = 3 + Math.max(1, addressLines.length);
  const dividerY = infoStartY + infoRows * 38 + 18;
  const itemsHeaderY = dividerY + 42;
  const itemsStartY = itemsHeaderY + 40;
  const itemsHeight = itemLineGroups.reduce((sum, lines) => sum + lines.length * lineHeight + 20, 0);
  const summaryY = itemsStartY + itemsHeight + 26;
  const canvasHeight = Math.max(860, summaryY + 180);

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  gradient.addColorStop(0, "#f4fff8");
  gradient.addColorStop(1, "#e5f3e8");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  drawRoundedRect(ctx, 60, 50, canvasWidth - 120, canvasHeight - 100, 30);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "rgba(31, 26, 23, 0.12)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#c15229";
  ctx.font = "700 44px Nunito, sans-serif";
  ctx.fillText("Felly-Best Foods", 100, 130);
  ctx.fillStyle = "#1f1a17";
  ctx.font = "700 34px Nunito, sans-serif";
  ctx.fillText("Purchase Receipt", 100, 180);

  ctx.fillStyle = "#5d5148";
  ctx.font = "500 25px Nunito, sans-serif";
  let infoY = infoStartY;
  ctx.fillText(`Date: ${createdAt}`, left, infoY);
  infoY += 38;
  ctx.fillText(`Customer: ${purchaser.name || "Guest"}`, left, infoY);
  infoY += 38;
  ctx.fillText(`Phone: ${purchaser.phone || "N/A"}`, left, infoY);
  infoY += 38;
  addressLines.forEach((line, idx) => {
    ctx.fillText(line, left, infoY + idx * 38);
  });

  ctx.strokeStyle = "rgba(193, 82, 41, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, dividerY);
  ctx.lineTo(right, dividerY);
  ctx.stroke();

  ctx.fillStyle = "#1f1a17";
  ctx.font = "700 24px Nunito, sans-serif";
  ctx.fillText("Items", left, itemsHeaderY);
  ctx.fillText("Line Total", amountX, itemsHeaderY);

  let y = itemsStartY;
  ctx.font = "600 23px Nunito, sans-serif";
  cart.forEach((item, idx) => {
    const lines = itemLineGroups[idx];
    lines.forEach((row, i) => {
      ctx.fillStyle = "#3f3630";
      ctx.fillText(row, left, y + i * lineHeight);
    });
    ctx.fillStyle = "#1f1a17";
    ctx.fillText(formatNaira(item.qty * item.price), amountX, y);
    y += lines.length * lineHeight + 20;
  });

  ctx.fillStyle = "#5d5148";
  ctx.font = "600 24px Nunito, sans-serif";
  ctx.fillText(`Subtotal: ${formatNaira(subtotal)}`, left, summaryY);
  ctx.fillText(`Delivery: ${formatNaira(delivery)}`, left, summaryY + 38);
  ctx.fillStyle = "#c15229";
  ctx.font = "800 34px Nunito, sans-serif";
  ctx.fillText(`Total: ${formatNaira(total)}`, left, summaryY + 92);

  ctx.fillStyle = "#5d5148";
  ctx.font = "500 20px Nunito, sans-serif";
  ctx.fillText("Thank you for choosing Felly-Best Foods.", left, canvasHeight - 60);

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `felly-best-receipt-${completedOrder.id || Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const setupLandingSignIn = () => {
  const form = document.querySelector("[data-landing-form]");
  const welcome = document.querySelector("[data-welcome]");
  const status = document.querySelector("[data-landing-status]");
  const eyebrow = document.querySelector("[data-auth-eyebrow]");
  const copy = document.querySelector("[data-auth-copy]");
  const submitButton = document.querySelector("[data-auth-submit]");
  const toggleButton = document.querySelector("[data-auth-toggle]");
  const resetButton = document.querySelector("[data-auth-reset]");
  if (!form || !welcome || !eyebrow || !copy || !submitButton || !toggleButton || !resetButton) return;

  const nameInput = form.querySelector("[data-auth-name]");
  const phoneInput = form.querySelector("[data-auth-phone]");
  const addressInput = form.querySelector("[data-auth-address]");
  if (!nameInput || !phoneInput || !addressInput) return;

  let mode = hasCompleteProfile(getUserProfile()) ? "login" : "signup";

  const setStatus = (message = "") => {
    if (status) status.textContent = message;
  };

  const applyMode = (nextMode) => {
    mode = nextMode;
    const existing = getUserProfile();
    const existingName = existing?.name || "";
    const existingPhone = existing?.phone || "";
    const existingAddress = existing?.address || "";

    setStatus("");

    if (mode === "login") {
      eyebrow.textContent = "Customer Log In";
      welcome.textContent = existingName ? `Welcome back, ${existingName}!` : "Log in to continue shopping";
      welcome.classList.toggle("show", Boolean(existingName));
      copy.textContent = "Returning customers can log in with their phone number.";
      submitButton.textContent = "Log In";
      toggleButton.textContent = "New customer? Sign Up";
      nameInput.value = existingName;
      phoneInput.value = existingPhone;
      addressInput.value = existingAddress;
      nameInput.classList.add("hidden");
      addressInput.classList.add("hidden");
      nameInput.required = false;
      addressInput.required = false;
      phoneInput.required = true;
      resetButton.classList.remove("hidden");
      return;
    }

    eyebrow.textContent = "Customer Sign Up";
    welcome.textContent = "Create your account to continue shopping";
    welcome.classList.remove("show");
    copy.textContent = "First-time customers should sign up with their name, phone number, and address.";
    submitButton.textContent = "Sign Up";
    toggleButton.textContent = "Already signed up? Log In";
    nameInput.classList.remove("hidden");
    addressInput.classList.remove("hidden");
    nameInput.required = true;
    addressInput.required = true;
    phoneInput.required = true;
    resetButton.classList.toggle("hidden", !hasCompleteProfile(existing));
  };

  const existing = getUserProfile();
  if (existing) {
    nameInput.value = existing.name || "";
    phoneInput.value = existing.phone || "";
    addressInput.value = existing.address || "";
  }
  applyMode(mode);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = phoneInput.value.trim();

    if (!phone) {
      setStatus("Enter your phone number.");
      return;
    }

    try {
      let result;

      if (mode === "login") {
        result = await apiRequest("/customers/login", {
          method: "POST",
          body: JSON.stringify({ phone })
        });
        setStatus("Login successful.");
      } else {
        const profile = {
          name: nameInput.value.trim(),
          phone,
          address: addressInput.value.trim()
        };

        if (!hasCompleteProfile(profile)) {
          setStatus("Enter name, phone number, and address.");
          return;
        }

        result = await apiRequest("/customers/signup", {
          method: "POST",
          body: JSON.stringify(profile)
        });
        setStatus("Sign-up successful.");
      }

      saveUserProfile(result.customer);
      nameInput.value = result.customer.name || "";
      phoneInput.value = result.customer.phone || "";
      addressInput.value = result.customer.address || "";
      applyMode("login");

      const redirectUrl = form.dataset.redirect;
      if (redirectUrl) {
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 600);
      }
    } catch (error) {
      setStatus(error.message || (mode === "login" ? "Login failed." : "Sign-up failed."));
    }
  });

  toggleButton.addEventListener("click", () => {
    applyMode(mode === "login" ? "signup" : "login");
  });

  resetButton.addEventListener("click", () => {
    clearUserProfile();
    form.reset();
    applyMode("signup");
  });
};

const clearCart = () => {
  saveCart([]);
  updateCartCount();
  renderCart();
};

const setupCheckout = () => {
  const checkout = document.querySelector("[data-checkout]");
  if (!checkout) return;
  const modal = document.querySelector("[data-checkout-modal]");
  const form = document.querySelector("[data-checkout-form]");
  const formStatus = document.querySelector("[data-checkout-form-status]");
  const closeButtons = document.querySelectorAll("[data-checkout-close]");

  const setFormStatus = (message = "") => {
    if (formStatus) formStatus.textContent = message;
  };

  const closeModal = () => {
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    setFormStatus("");
  };

  const openModal = () => {
    if (!modal || !form) return;
    const profile = getUserProfile() || {};
    const nameInput = form.querySelector('[name="name"]');
    const phoneInput = form.querySelector('[name="phone"]');
    const addressInput = form.querySelector('[name="address"]');

    if (nameInput) nameInput.value = profile.name || "";
    if (phoneInput) phoneInput.value = profile.phone || "";
    if (addressInput) addressInput.value = profile.address || "";

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setFormStatus("");
    if (nameInput) nameInput.focus();
  };

  closeButtons.forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  checkout.addEventListener("click", () => {
    const cart = getCart();

    if (!cart.length) {
      showStatus("Your cart is empty. Add items before checkout.");
      return;
    }

    if (!modal || !form) {
      showStatus("Checkout form is missing on this page. Reload and try again.");
      return;
    }

    openModal();
  });

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const cart = getCart();
    if (!cart.length) {
      closeModal();
      showStatus("Your cart is empty. Add items before checkout.");
      return;
    }

    const nameInput = form.querySelector('[name="name"]');
    const phoneInput = form.querySelector('[name="phone"]');
    const addressInput = form.querySelector('[name="address"]');
    const purchaser = {
      name: String(nameInput?.value || "").trim(),
      phone: String(phoneInput?.value || "").trim(),
      address: String(addressInput?.value || "").trim()
    };

    if (!hasCompleteProfile(purchaser)) {
      setFormStatus("Enter name, phone number, and address.");
      return;
    }

    setFormStatus("Placing order...");
    try {
      const result = await apiRequest("/orders", {
        method: "POST",
        body: JSON.stringify({ items: cart, purchaser })
      });
      const order = result.order || {};
      const whatsappLink = buildOrderWhatsAppLink(order, purchaser);
      saveUserProfile(purchaser);
      saveLastReceiptOrder({
        ...order,
        purchaser: order.purchaser || purchaser
      });
      updateReceiptButtonState();
      clearCart();
      closeModal();
      showStatus("Order received. Redirecting to WhatsApp...");
      setTimeout(() => {
        window.location.href = whatsappLink;
      }, 500);
    } catch (error) {
      setFormStatus(error.message || "Unable to place order.");
    }
  });
};

const setupContactOrderForm = () => {
  const form = document.querySelector(".contact-form");
  if (!form) return;

  const [nameInput, emailInput, phoneInput, orderInput] = form.querySelectorAll("input, textarea");
  const status = form.querySelector("[data-contact-form-status]");

  const setStatus = (message = "") => {
    if (status) status.textContent = message;
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = String(nameInput?.value || "").trim();
    const email = String(emailInput?.value || "").trim();
    const phone = String(phoneInput?.value || "").trim();
    const orderRequest = String(orderInput?.value || "").trim();

    if (!name || !phone || !orderRequest) {
      setStatus("Please enter your name, phone number, and order details.");
      return;
    }

    const lines = [
      "Hello Felly-Best Foods, I want to place an order.",
      "",
      `Name: ${name}`,
      `Phone: ${phone}`
    ];

    if (email) {
      lines.push(`Email: ${email}`);
    }

    lines.push("", "Order Details:", orderRequest);

    const whatsappLink = `https://wa.me/${whatsappOrderNumber}?text=${encodeURIComponent(lines.join("\n"))}`;
    setStatus("Opening WhatsApp...");
    window.location.href = whatsappLink;
  });
};

const setupReceiptDownload = () => {
  const receiptBtn = document.querySelector("[data-receipt]");
  if (!receiptBtn) return;

  updateReceiptButtonState();
  receiptBtn.addEventListener("click", downloadReceiptPng);
};

const renderOrders = async (adminPasscode) => {
  const tableBody = document.querySelector("[data-orders-table] tbody");
  if (!tableBody) return;

  tableBody.innerHTML = "<tr><td colspan=\"8\">Loading orders...</td></tr>";

  try {
    const result = await apiRequest("/orders", {
      headers: {
        "x-admin-passcode": adminPasscode
      }
    });
    const orders = result.orders || [];
    tableBody.innerHTML = "";

    if (!orders.length) {
      tableBody.innerHTML = "<tr><td colspan=\"8\">No orders yet.</td></tr>";
      return;
    }

    orders.forEach((order) => {
      const purchaser = order.purchaser || {};
      const itemsText = (order.items || [])
        .map((item) => `${item.name} x${item.qty}`)
        .join(", ");

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${order.id}</td>
        <td>${order.date}</td>
        <td>${purchaser.name || "Not provided"}</td>
        <td>${purchaser.phone || "Not provided"}</td>
        <td>${purchaser.address || "Not provided"}</td>
        <td>${itemsText || "No items"}</td>
        <td>${formatNaira(order.total)}</td>
        <td><button class="remove-btn" data-remove-order="${order.id}">Remove</button></td>
      `;
      tableBody.appendChild(row);
    });

    tableBody.querySelectorAll("[data-remove-order]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await apiRequest(`/orders/${button.dataset.removeOrder}`, {
            method: "DELETE",
            headers: {
              "x-admin-passcode": adminPasscode
            }
          });
          renderOrders(adminPasscode);
        } catch (error) {
          alert(error.message || "Unable to remove order.");
        }
      });
    });
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="8">${error.message || "Unable to load orders."}</td></tr>`;
  }
};

const setupAdminAccess = () => {
  const authCard = document.querySelector("[data-admin-auth-card]");
  const panel = document.querySelector("[data-admin-panel]");
  const form = document.querySelector("[data-admin-auth-form]");
  const passcodeInput = document.querySelector("[data-admin-passcode]");
  const status = document.querySelector("[data-admin-auth-status]");
  const logoutBtn = document.querySelector("[data-admin-logout]");
  if (!authCard || !panel || !form || !passcodeInput) return;

  const showPanel = async (passcode) => {
    authCard.classList.add("hidden");
    panel.classList.remove("hidden");
    await renderOrders(passcode);
  };

  const storedPasscode = getAdminPasscode();
  if (storedPasscode) {
    apiRequest("/admin/login", {
      method: "POST",
      body: JSON.stringify({ passcode: storedPasscode })
    })
      .then(() => showPanel(storedPasscode))
      .catch(() => {
        clearAdminPasscode();
        authCard.classList.remove("hidden");
        panel.classList.add("hidden");
      });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const passcode = passcodeInput.value.trim();
    if (!passcode) {
      if (status) status.textContent = "Enter admin passcode.";
      return;
    }

    try {
      await apiRequest("/admin/login", {
        method: "POST",
        body: JSON.stringify({ passcode })
      });
      saveAdminPasscode(passcode);
      if (status) status.textContent = "";
      passcodeInput.value = "";
      await showPanel(passcode);
    } catch (error) {
      if (status) status.textContent = error.message || "Invalid passcode.";
    }
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearAdminPasscode();
      panel.classList.add("hidden");
      authCard.classList.remove("hidden");
      if (status) status.textContent = "Logged out.";
    });
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!enforceCustomerAccessGate()) return;
  if (!(await enforceAdminAccessGate())) return;
  setupSiteBackgroundCarousel();
  setupNavToggle();
  setupShopHeroCarousel();
  setupReveal();
  setupLandingSignIn();
  setupAdminAccess();
  updateCartCount();
  setupAddButtons();
  renderCart();
  setupCheckout();
  setupContactOrderForm();
  setupReceiptDownload();
});
