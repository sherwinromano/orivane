/**
 * <customer-reviews>
 * Draggable, scroll-snap based reviews slider with clickable pagination dots.
 *
 * - Touch and trackpad use native scrolling (CSS scroll-snap does the snapping).
 * - Mouse users can click-and-drag the track.
 * - Dots are built from the current layout (items per view) and rebuilt on resize.
 * - Without JavaScript the track is still scrollable; only the dots are missing.
 */
if (!customElements.get("customer-reviews")) {
  class CustomerReviews extends HTMLElement {
    constructor() {
      super();

      this.drag = null;
      this.frame = null;
      this.currentPage = -1;
      this.pageCount = 0;

      this.onScroll = this.onScroll.bind(this);
      this.onKeydown = this.onKeydown.bind(this);
      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerUp = this.onPointerUp.bind(this);
      this.onSelectStart = this.onSelectStart.bind(this);
      this.onDotClick = this.onDotClick.bind(this);
      this.onBlockSelect = this.onBlockSelect.bind(this);
    }

    connectedCallback() {
      this.track = this.querySelector("[data-track]");
      this.dotsContainer = this.querySelector("[data-dots]");
      if (!this.track || !this.dotsContainer) return;

      this.items = Array.from(this.track.children);
      this.reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      );
      this.abortController = new AbortController();
      const { signal } = this.abortController;

      this.track.addEventListener("scroll", this.onScroll, {
        passive: true,
        signal,
      });
      this.track.addEventListener("keydown", this.onKeydown, { signal });
      this.track.addEventListener("pointerdown", this.onPointerDown, {
        signal,
      });
      this.track.addEventListener("pointermove", this.onPointerMove, {
        signal,
      });
      this.track.addEventListener("pointerup", this.onPointerUp, { signal });
      this.track.addEventListener("pointercancel", this.onPointerUp, {
        signal,
      });
      this.track.addEventListener("selectstart", this.onSelectStart, {
        signal,
      });
      this.dotsContainer.addEventListener("click", this.onDotClick, { signal });
      this.addEventListener("shopify:block:select", this.onBlockSelect, {
        signal,
      });

      this.resizeObserver = new ResizeObserver(() => this.update());
      this.resizeObserver.observe(this.track);

      this.update();
    }

    disconnectedCallback() {
      if (this.abortController) this.abortController.abort();
      if (this.resizeObserver) this.resizeObserver.disconnect();
      if (this.frame) cancelAnimationFrame(this.frame);
    }

    /* ---------- Layout metrics ---------- */

    get isRtl() {
      return getComputedStyle(this.track).direction === "rtl";
    }

    getMetrics() {
      const first = this.items[0];
      if (!first) return null;

      const gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
      const itemStep = first.getBoundingClientRect().width + gap;
      if (!itemStep) return null;

      const perView = Math.max(
        1,
        Math.round((this.track.clientWidth + gap) / itemStep),
      );
      const maxScroll = Math.max(
        0,
        this.track.scrollWidth - this.track.clientWidth,
      );
      const pages = Math.max(1, Math.ceil(this.items.length / perView));

      return { itemStep, perView, maxScroll, pages };
    }

    getPosition() {
      return Math.abs(this.track.scrollLeft);
    }

    /* ---------- Scrolling ---------- */

    scrollToPosition(position, metrics) {
      const clamped = Math.min(Math.max(position, 0), metrics.maxScroll);
      this.track.scrollTo({
        left: this.isRtl ? -clamped : clamped,
        behavior: this.reducedMotion.matches ? "auto" : "smooth",
      });
    }

    goToPage(page) {
      const metrics = this.getMetrics();
      if (!metrics) return;

      const index =
        Math.min(Math.max(page, 0), metrics.pages - 1) * metrics.perView;
      this.scrollToPosition(index * metrics.itemStep, metrics);
    }

    goToItem(index) {
      const metrics = this.getMetrics();
      if (!metrics) return;

      const safeIndex = Math.min(Math.max(index, 0), this.items.length - 1);
      this.scrollToPosition(safeIndex * metrics.itemStep, metrics);
    }

    /* ---------- Pagination ---------- */

    update() {
      const metrics = this.getMetrics();
      if (!metrics) return;

      if (metrics.pages !== this.pageCount) {
        this.renderDots(metrics.pages);
      }

      this.dotsContainer.hidden = metrics.pages <= 1;
      this.setActivePage(this.getPageFromScroll(metrics));
    }

    renderDots(pages) {
      const label = this.dataset.dotLabel || "Go to review group";
      this.pageCount = pages;
      this.currentPage = -1;

      this.dotsContainer.innerHTML = Array.from(
        { length: pages },
        (_, index) =>
          `<button type="button" class="customer-reviews__dot" data-page="${index}" aria-label="${label} ${index + 1} of ${pages}"></button>`,
      ).join("");
    }

    getPageFromScroll(metrics) {
      const position = this.getPosition();

      if (position >= metrics.maxScroll - 2) return metrics.pages - 1;

      const page = Math.round(position / (metrics.itemStep * metrics.perView));
      return Math.min(Math.max(page, 0), metrics.pages - 1);
    }

    setActivePage(page) {
      if (page === this.currentPage) return;
      this.currentPage = page;

      this.dotsContainer
        .querySelectorAll(".customer-reviews__dot")
        .forEach((dot, index) => {
          if (index === page) {
            dot.setAttribute("aria-current", "true");
          } else {
            dot.removeAttribute("aria-current");
          }
        });
    }

    /* ---------- Event handlers ---------- */

    onScroll() {
      if (this.frame) return;

      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        const metrics = this.getMetrics();
        if (metrics) this.setActivePage(this.getPageFromScroll(metrics));
      });
    }

    onDotClick(event) {
      const dot = event.target.closest(".customer-reviews__dot");
      if (!dot) return;

      this.goToPage(Number(dot.dataset.page));
    }

    onKeydown(event) {
      if (event.target !== this.track) return;

      const forwardKey = this.isRtl ? "ArrowLeft" : "ArrowRight";
      const backwardKey = this.isRtl ? "ArrowRight" : "ArrowLeft";
      const metrics = this.getMetrics();
      if (!metrics) return;

      const currentIndex = Math.round(this.getPosition() / metrics.itemStep);

      if (event.key === forwardKey) {
        event.preventDefault();
        this.goToItem(currentIndex + 1);
      } else if (event.key === backwardKey) {
        event.preventDefault();
        this.goToItem(currentIndex - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        this.goToItem(0);
      } else if (event.key === "End") {
        event.preventDefault();
        this.goToItem(this.items.length - 1);
      }
    }

    /* ---------- Mouse dragging (touch uses native scrolling) ---------- */

    onPointerDown(event) {
      if (event.pointerType !== "mouse" || event.button !== 0) return;

      const metrics = this.getMetrics();
      if (!metrics || metrics.maxScroll <= 1) return;

      this.drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startScroll: this.track.scrollLeft,
        moved: false,
      };
    }

    onPointerMove(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;

      const deltaX = event.clientX - this.drag.startX;

      if (!this.drag.moved) {
        if (Math.abs(deltaX) < 5) return;

        this.drag.moved = true;
        this.track.setPointerCapture(event.pointerId);
        this.track.classList.add("is-dragging");
      }

      this.track.scrollLeft = this.drag.startScroll - deltaX;
    }

    onPointerUp(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;

      const { moved, startScroll } = this.drag;
      this.drag = null;
      if (!moved) return;

      if (this.track.hasPointerCapture(event.pointerId)) {
        this.track.releasePointerCapture(event.pointerId);
      }
      this.track.classList.remove("is-dragging");

      const metrics = this.getMetrics();
      if (!metrics) return;

      // Settle on the nearest review; a short flick still moves one review.
      const start = Math.abs(startScroll);
      const position = this.getPosition();
      const startIndex = Math.round(start / metrics.itemStep);
      let index = Math.round(position / metrics.itemStep);

      if (index === startIndex && Math.abs(position - start) > 30) {
        index += position > start ? 1 : -1;
      }

      this.goToItem(index);
    }

    onSelectStart(event) {
      if (this.drag && this.drag.moved) event.preventDefault();
    }

    /* ---------- Theme Editor ---------- */

    onBlockSelect(event) {
      const item = event.target.closest(".customer-reviews__item");
      if (!item) return;

      this.goToItem(this.items.indexOf(item));
    }
  }

  customElements.define("customer-reviews", CustomerReviews);
}
