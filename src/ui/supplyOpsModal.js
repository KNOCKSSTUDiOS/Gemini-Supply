/**
 * Gemini Supply - Channel & Fulfillment Operations Workspace (100vw x 100dvh, z-index: 52)
 * Prepares first-time sellers for Printify, Printful, TikTok Shop, and Etsy:
 * 01. Launch Checklist  02. SKU & Print Matrix  03. Margin & Fee Engine  04. Channel Sync & Export
 */

import { PRODUCTS, PRODUCTS_BY_ID, webPhoto } from '../data/catalog.js';
import {
  CHANNELS,
  PROVIDERS,
  DEFAULT_SKU_PROFILES,
  CHANNEL_POLICY_SUMMARY,
} from '../data/supplyOpsData.js';
import {
  IS_SCREENSHOT_MODE,
  prefersReducedMotion,
  openProductStage,
} from '../state/store.js';
import {
  getSupplyOpsSnapshot,
  subscribeSupplyOps,
  subscribeSupplyOpsModal,
  closeSupplyOps,
  isSupplyOpsOpen,
  setSupplyOpsTab,
  setChecklistFilter,
  toggleChecklistItem,
  addCustomChecklistItem,
  removeCustomChecklistItem,
  updateSkuConfig,
  updateMarginSettings,
  resetSupplyOpsState,
  getAllChecklistItems,
  calculateUnitEconomics,
  formatCurrency,
  runPreflightAudit,
  buildEtsyCsv,
  buildTikTokCsv,
  buildProviderRoutingJson,
} from '../state/supplyOpsStore.js';
import { createSparkSvgElement } from './proceduralSparkSvg.js';

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function initSupplyOps(mountEl, { onLockScroll } = {}) {
  const hostEl = mountEl || document.body;
  hostEl.innerHTML = '';

  const overlayEl = document.createElement('div');
  overlayEl.id = 'supply-ops-modal';
  overlayEl.className = 'gs-ops';
  overlayEl.setAttribute('data-lenis-prevent', '');
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('aria-modal', 'true');
  overlayEl.setAttribute('aria-hidden', 'true');
  overlayEl.setAttribute('aria-labelledby', 'ops-topbar-title');

  overlayEl.innerHTML = `
    <div class="gs-ops__shell">
      <aside class="gs-ops__sidebar" aria-label="Operations sections">
        <div class="gs-ops__brand">
          <span class="gs-ops__brand-spark" aria-hidden="true"></span>
          <span class="gs-ops__brand-text">Supply Ops</span>
        </div>

        <nav class="gs-ops__nav" id="ops-nav">
          <button type="button" class="gs-ops__nav-btn" data-tab="checklist">
            <span class="gs-ops__nav-idx">01</span>
            <span class="gs-ops__nav-label">Launch Checklist</span>
          </button>
          <button type="button" class="gs-ops__nav-btn" data-tab="skus">
            <span class="gs-ops__nav-idx">02</span>
            <span class="gs-ops__nav-label">SKU &amp; Print Matrix</span>
          </button>
          <button type="button" class="gs-ops__nav-btn" data-tab="margins">
            <span class="gs-ops__nav-idx">03</span>
            <span class="gs-ops__nav-label">Margin &amp; Fee Engine</span>
          </button>
          <button type="button" class="gs-ops__nav-btn" data-tab="export">
            <span class="gs-ops__nav-idx">04</span>
            <span class="gs-ops__nav-label">Sync &amp; Export</span>
          </button>
        </nav>

        <div class="gs-ops__summary" id="ops-sidebar-summary"></div>
      </aside>

      <div class="gs-ops__workspace">
        <header class="gs-ops__topbar">
          <div class="gs-ops__breadcrumb">
            <span id="ops-topbar-title" class="gs-ops__crumb-root">Gemini Supply</span>
            <span class="gs-ops__crumb-sep" aria-hidden="true">/</span>
            <span class="gs-ops__crumb-active" id="ops-crumb-active">Launch Checklist</span>
          </div>

          <div class="gs-ops__topbar-actions">
            <button type="button" id="ops-audit-jump-btn" class="gs-ops__action-btn gs-pressable">
              Run Preflight Audit
            </button>
            <button type="button" id="ops-close-btn" class="gs-ops__close gs-pressable" aria-label="Close Supply Ops">
              <span>CLOSE [ ESC ]</span>
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </header>

        <div class="gs-ops__content" id="ops-content-mount"></div>
      </div>
    </div>
  `;

  hostEl.appendChild(overlayEl);

  const brandSparkEl = overlayEl.querySelector('.gs-ops__brand-spark');
  if (brandSparkEl) {
    brandSparkEl.appendChild(createSparkSvgElement(14, 0.64));
  }

  const closeBtn = overlayEl.querySelector('#ops-close-btn');
  const auditJumpBtn = overlayEl.querySelector('#ops-audit-jump-btn');
  const navBtns = Array.from(overlayEl.querySelectorAll('.gs-ops__nav-btn'));
  const crumbActiveEl = overlayEl.querySelector('#ops-crumb-active');
  const summaryEl = overlayEl.querySelector('#ops-sidebar-summary');
  const contentEl = overlayEl.querySelector('#ops-content-mount');

  let lastFocusedEl = null;
  let skuSearchQuery = '';
  let resetConfirmArmed = false;
  let exportNotice = '';

  const TAB_TITLES = {
    checklist: 'Launch Checklist',
    skus: 'SKU & Print Matrix',
    margins: 'Margin & Fee Engine',
    export: 'Channel Sync & Export',
  };

  function renderSidebarSummary(snap) {
    const allTasks = getAllChecklistItems(snap);
    const doneCount = allTasks.filter((t) => snap.completedChecklistIds.includes(t.id)).length;
    const printReadyCount = PRODUCTS.filter((p) => snap.skuConfigs[p.id]?.printFileReady).length;
    const audit = runPreflightAudit(snap);

    summaryEl.innerHTML = `
      <div class="gs-ops__stat-row">
        <span class="gs-ops__stat-label">CHECKLIST</span>
        <span class="gs-ops__stat-val">${doneCount}/${allTasks.length}</span>
      </div>
      <div class="gs-ops__stat-row">
        <span class="gs-ops__stat-label">PRINT FILES</span>
        <span class="gs-ops__stat-val">${printReadyCount}/${PRODUCTS.length}</span>
      </div>
      <div class="gs-ops__stat-row">
        <span class="gs-ops__stat-label">AUDIT FLAGS</span>
        <span class="gs-ops__stat-val ${audit.issues.length === 0 ? 'is-nominal' : 'is-warn'}">${
          audit.issues.length === 0 ? 'ALL CLEAR' : `${audit.issues.length} OPEN`
        }</span>
      </div>
    `;
  }

  function renderChecklistView(snap) {
    const allTasks = getAllChecklistItems(snap);
    const filtered =
      snap.checklistFilter === 'all'
        ? allTasks
        : allTasks.filter((item) => item.channel === snap.checklistFilter);

    const completedSet = new Set(snap.completedChecklistIds);
    const totalDone = allTasks.filter((t) => completedSet.has(t.id)).length;

    const filterButtonsHtml = ['all', ...CHANNELS]
      .map((ch) => {
        const active = snap.checklistFilter === ch;
        const label = ch === 'all' ? 'All Channels' : ch;
        return `<button type="button" class="gs-ops__seg-btn ${active ? 'is-active' : ''}" data-filter="${escapeHtml(ch)}">${escapeHtml(label)}</button>`;
      })
      .join('');

    const rowsHtml = filtered
      .map((task) => {
        const checked = completedSet.has(task.id);
        return `
          <div class="gs-ops__check-row ${checked ? 'is-checked' : ''}" data-task-id="${escapeHtml(task.id)}">
            <label class="gs-ops__checkbox-wrap">
              <input type="checkbox" class="gs-ops__checkbox" data-toggle-task="${escapeHtml(task.id)}" ${checked ? 'checked' : ''} />
              <span class="gs-ops__checkbox-box" aria-hidden="true">${checked ? '✓' : ''}</span>
            </label>
            <div class="gs-ops__check-body">
              <div class="gs-ops__check-meta">
                <span>${escapeHtml(task.channel)}</span>
                <span aria-hidden="true">·</span>
                <span class="${task.priority === 'Critical' ? 'is-critical-text' : ''}">${escapeHtml(task.priority)}</span>
              </div>
              <div class="gs-ops__check-title">${escapeHtml(task.title)}</div>
              <p class="gs-ops__check-detail">${escapeHtml(task.detail)}</p>
            </div>
            <div class="gs-ops__check-actions">
              ${
                task.jumpTab
                  ? `<button type="button" class="gs-ops__inline-btn" data-jump-tab="${escapeHtml(task.jumpTab)}">Configure →</button>`
                  : ''
              }
              ${
                task.isCustom
                  ? `<button type="button" class="gs-ops__inline-btn" data-remove-custom="${escapeHtml(task.id)}">Remove</button>`
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');

    contentEl.innerHTML = `
      <section class="gs-ops__section">
        <div class="gs-ops__section-head">
          <div>
            <h2 class="gs-ops__h2">First-Timer Channel Launch Checklist</h2>
            <p class="gs-ops__lead">Step-by-step operational prep for Printify, Printful, TikTok Shop, and Etsy before your first live order.</p>
          </div>
          <div class="gs-ops__kpi-inline">
            <span class="gs-ops__kpi-num">${totalDone}/${allTasks.length}</span>
            <span class="gs-ops__kpi-unit">STEPS COMPLETE</span>
          </div>
        </div>

        <div class="gs-ops__toolbar">
          <div class="gs-ops__seg-group" role="tablist" aria-label="Filter checklist by platform">
            ${filterButtonsHtml}
          </div>
        </div>

        <div class="gs-ops__check-list">
          ${rowsHtml || '<p class="gs-ops__empty-msg">No tasks match this channel filter.</p>'}
        </div>

        <form class="gs-ops__add-form" id="ops-add-task-form">
          <input
            type="text"
            id="ops-custom-task-input"
            class="gs-ops__input"
            placeholder="Add a custom prep note (e.g. Order poly mailers for pins)..."
            aria-label="Custom checklist task"
          />
          <select id="ops-custom-task-channel" class="gs-ops__select" aria-label="Task channel">
            ${CHANNELS.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
          </select>
          <button type="submit" class="gs-ops__btn-solid">Add Task</button>
        </form>
      </section>
    `;

    contentEl.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setChecklistFilter(btn.dataset.filter);
      });
    });

    contentEl.querySelectorAll('[data-toggle-task]').forEach((input) => {
      input.addEventListener('change', () => {
        toggleChecklistItem(input.dataset.toggleTask);
      });
    });

    contentEl.querySelectorAll('[data-jump-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setSupplyOpsTab(btn.dataset.jumpTab);
      });
    });

    contentEl.querySelectorAll('[data-remove-custom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        removeCustomChecklistItem(btn.dataset.removeCustom);
      });
    });

    const addForm = contentEl.querySelector('#ops-add-task-form');
    if (addForm) {
      addForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = contentEl.querySelector('#ops-custom-task-input');
        const sel = contentEl.querySelector('#ops-custom-task-channel');
        if (input && input.value.trim()) {
          addCustomChecklistItem(input.value, sel ? sel.value : 'Foundation');
        }
      });
    }
  }

  function renderSkuMatrixView(snap) {
    const query = skuSearchQuery.trim().toLowerCase();
    const filteredProducts = PRODUCTS.filter((p) => {
      if (!query) return true;
      const cfg = snap.skuConfigs[p.id];
      return (
        p.title.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query) ||
        (cfg?.skuPrefix || '').toLowerCase().includes(query) ||
        (cfg?.primaryProvider || '').toLowerCase().includes(query)
      );
    });

    const rowsHtml = filteredProducts
      .map((product) => {
        const cfg = snap.skuConfigs[product.id];
        const profile = DEFAULT_SKU_PROFILES[product.id];
        const slaRisk = cfg.channels.tiktok && cfg.prodDaysMax > 3;

        return `
          <div class="gs-ops__sku-card" data-product-id="${product.id}">
            <div class="gs-ops__sku-head">
              <div class="gs-ops__sku-ident">
                <img
                  src="${webPhoto(product.cardPrimaryShot)}"
                  alt="${escapeHtml(product.title)}"
                  class="gs-ops__sku-thumb"
                  loading="lazy"
                />
                <div class="gs-ops__sku-titles">
                  <div class="gs-ops__sku-name">${escapeHtml(product.title)}</div>
                  <div class="gs-ops__sku-meta">
                    <span>${escapeHtml(product.category)}</span>
                    <span aria-hidden="true">·</span>
                    <span>${escapeHtml(product.sizes.join(' / '))}</span>
                    <span aria-hidden="true">·</span>
                    <span>${escapeHtml(profile.productionMethod)}</span>
                  </div>
                </div>
              </div>

              <div class="gs-ops__sku-head-right">
                <span class="gs-ops__sla-tag ${slaRisk ? 'is-warn' : 'is-nominal'}">
                  ${slaRisk ? `Watch TikTok SLA (${cfg.prodDaysMin}–${cfg.prodDaysMax}d)` : `Dispatch ${cfg.prodDaysMin}–${cfg.prodDaysMax}d`}
                </span>
                <button type="button" class="gs-ops__inline-btn" data-inspect-product="${product.id}">
                  Inspect Angles
                </button>
              </div>
            </div>

            <div class="gs-ops__sku-grid">
              <label class="gs-ops__field">
                <span class="gs-ops__field-label">CANONICAL SKU</span>
                <input
                  type="text"
                  class="gs-ops__input gs-ops__input--mono"
                  data-sku-field="skuPrefix"
                  data-pid="${product.id}"
                  value="${escapeHtml(cfg.skuPrefix)}"
                />
              </label>

              <label class="gs-ops__field">
                <span class="gs-ops__field-label">PRIMARY PROVIDER</span>
                <select class="gs-ops__select" data-sku-field="primaryProvider" data-pid="${product.id}">
                  ${PROVIDERS.filter((pr) => pr !== 'None')
                    .map(
                      (pr) =>
                        `<option value="${escapeHtml(pr)}" ${cfg.primaryProvider === pr ? 'selected' : ''}>${escapeHtml(pr)}</option>`
                    )
                    .join('')}
                </select>
              </label>

              <label class="gs-ops__field">
                <span class="gs-ops__field-label">BACKUP PROVIDER</span>
                <select class="gs-ops__select" data-sku-field="backupProvider" data-pid="${product.id}">
                  ${PROVIDERS.map(
                    (pr) =>
                      `<option value="${escapeHtml(pr)}" ${cfg.backupProvider === pr ? 'selected' : ''}>${escapeHtml(pr)}</option>`
                  ).join('')}
                </select>
              </label>

              <label class="gs-ops__field">
                <span class="gs-ops__field-label">STOCK BUFFER (QTY)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  class="gs-ops__input gs-ops__input--mono"
                  data-sku-field="stockBuffer"
                  data-pid="${product.id}"
                  value="${cfg.stockBuffer}"
                />
              </label>
            </div>

            <div class="gs-ops__sku-spec-line">
              <span class="gs-ops__spec-k">PRINT FILE:</span>
              <span class="gs-ops__spec-v">${escapeHtml(profile.printFileSpec)}</span>
              <span class="gs-ops__spec-sep" aria-hidden="true">·</span>
              <span class="gs-ops__spec-v">${escapeHtml(profile.slaAdvisory)}</span>
            </div>

            <div class="gs-ops__sku-toggles">
              <label class="gs-ops__mini-check">
                <input type="checkbox" data-sku-bool="printFileReady" data-pid="${product.id}" ${cfg.printFileReady ? 'checked' : ''} />
                <span>Print File Ready (300 DPI / .DST)</span>
              </label>
              <label class="gs-ops__mini-check">
                <input type="checkbox" data-sku-bool="sampleOrdered" data-pid="${product.id}" ${cfg.sampleOrdered ? 'checked' : ''} />
                <span>Sample Verified</span>
              </label>
              <label class="gs-ops__mini-check">
                <input type="checkbox" data-sku-bool="etsyPartnerDisclosed" data-pid="${product.id}" ${cfg.etsyPartnerDisclosed ? 'checked' : ''} />
                <span>Etsy Partner Disclosed</span>
              </label>

              <div class="gs-ops__channel-switches" role="group" aria-label="Enabled sales and fulfillment channels">
                ${['printify', 'printful', 'tiktok', 'etsy']
                  .map((chKey) => {
                    const active = Boolean(cfg.channels[chKey]);
                    const labelMap = {
                      printify: 'Printify',
                      printful: 'Printful',
                      tiktok: 'TikTok',
                      etsy: 'Etsy',
                    };
                    return `
                      <button
                        type="button"
                        class="gs-ops__ch-toggle ${active ? 'is-on' : ''}"
                        data-sku-channel="${chKey}"
                        data-pid="${product.id}"
                        aria-pressed="${active ? 'true' : 'false'}"
                      >${labelMap[chKey]}: ${active ? 'ON' : 'OFF'}</button>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    contentEl.innerHTML = `
      <section class="gs-ops__section">
        <div class="gs-ops__section-head">
          <div>
            <h2 class="gs-ops__h2">SKU &amp; Print Provider Matrix</h2>
            <p class="gs-ops__lead">Map all 8 Gemini Supply pieces to unified SKU codes, primary/backup POD partners, print files, and channel toggles.</p>
          </div>
          <div class="gs-ops__search-wrap">
            <input
              type="search"
              id="ops-sku-search"
              class="gs-ops__input"
              placeholder="Filter by name, SKU, or provider..."
              value="${escapeHtml(skuSearchQuery)}"
              aria-label="Filter SKUs"
            />
          </div>
        </div>

        <div class="gs-ops__sku-list">
          ${rowsHtml || '<p class="gs-ops__empty-msg">No products match your filter.</p>'}
        </div>
      </section>
    `;

    const searchInput = contentEl.querySelector('#ops-sku-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        skuSearchQuery = e.target.value;
        renderSkuMatrixView(getSupplyOpsSnapshot());
        const nextSearch = contentEl.querySelector('#ops-sku-search');
        if (nextSearch) {
          nextSearch.focus();
          nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
        }
      });
    }

    contentEl.querySelectorAll('[data-inspect-product]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.inspectProduct;
        const prod = PRODUCTS_BY_ID[pid];
        closeSupplyOps(true);
        openProductStage(pid, prod?.cardPrimaryShot || null, IS_SCREENSHOT_MODE || prefersReducedMotion());
      });
    });

    contentEl.querySelectorAll('[data-sku-field]').forEach((el) => {
      const eventName = el.tagName === 'SELECT' ? 'change' : 'change';
      el.addEventListener(eventName, () => {
        const pid = el.dataset.pid;
        const field = el.dataset.skuField;
        const val = el.type === 'number' ? Math.max(0, Number(el.value) || 0) : el.value.trim();
        updateSkuConfig(pid, { [field]: val });
      });
    });

    contentEl.querySelectorAll('[data-sku-bool]').forEach((el) => {
      el.addEventListener('change', () => {
        updateSkuConfig(el.dataset.pid, { [el.dataset.skuBool]: el.checked });
      });
    });

    contentEl.querySelectorAll('[data-sku-channel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid;
        const ch = btn.dataset.skuChannel;
        const current = getSupplyOpsSnapshot().skuConfigs[pid];
        if (!current) return;
        updateSkuConfig(pid, {
          channels: {
            [ch]: !current.channels[ch],
          },
        });
      });
    });
  }

  function renderMarginsView(snap) {
    const ms = snap.marginSettings;
    const isUsd = ms.currency === 'USD';
    const rate = isUsd ? Number(ms.gbpToUsd) || 1.27 : 1;

    const tableRows = PRODUCTS.map((product) => {
      const cfg = snap.skuConfigs[product.id];
      const econ = calculateUnitEconomics(cfg, ms);
      const displayRetail = (cfg.retailPriceGbp * rate).toFixed(2);
      const displayCost = (cfg.unitCostGbp * rate).toFixed(2);
      const totalFees = econ.platformFeeGbp + econ.paymentFeeGbp + econ.affiliateFeeGbp;

      return `
        <tr>
          <td class="gs-ops__td-product">
            <div class="gs-ops__td-title">${escapeHtml(product.title)}</div>
            <div class="gs-ops__td-sub">${escapeHtml(cfg.skuPrefix)} · ${escapeHtml(cfg.primaryProvider)}</div>
          </td>
          <td class="gs-ops__td-num">
            <input
              type="number"
              min="0"
              step="0.5"
              class="gs-ops__table-input"
              data-econ-field="retailPriceGbp"
              data-pid="${product.id}"
              value="${displayRetail}"
              aria-label="Retail price for ${escapeHtml(product.title)}"
            />
          </td>
          <td class="gs-ops__td-num">
            <input
              type="number"
              min="0"
              step="0.5"
              class="gs-ops__table-input"
              data-econ-field="unitCostGbp"
              data-pid="${product.id}"
              value="${displayCost}"
              aria-label="Fulfillment cost for ${escapeHtml(product.title)}"
            />
          </td>
          <td class="gs-ops__td-num">${formatCurrency(totalFees, ms)}</td>
          <td class="gs-ops__td-num ${econ.netProfitGbp <= 0 ? 'is-loss' : ''}">${formatCurrency(econ.netProfitGbp, ms)}</td>
          <td class="gs-ops__td-num">${econ.netMarginPct.toFixed(1)}%</td>
          <td class="gs-ops__td-num">${econ.breakEvenRoas > 0 ? `${econ.breakEvenRoas.toFixed(2)}x` : '—'}</td>
          <td class="gs-ops__td-status">
            <span class="gs-ops__status-label is-${econ.status.toLowerCase()}">${econ.status}</span>
          </td>
        </tr>
      `;
    }).join('');

    contentEl.innerHTML = `
      <section class="gs-ops__section">
        <div class="gs-ops__section-head">
          <div>
            <h2 class="gs-ops__h2">Margin &amp; Platform Fee Engine</h2>
            <p class="gs-ops__lead">Model real take-home profit after Printify/Printful blank + shipping costs, TikTok referral + creator commissions, or Etsy fees.</p>
          </div>

          <div class="gs-ops__seg-group" role="group" aria-label="Currency toggle">
            <button type="button" class="gs-ops__seg-btn ${ms.currency === 'GBP' ? 'is-active' : ''}" data-currency="GBP">GBP £</button>
            <button type="button" class="gs-ops__seg-btn ${ms.currency === 'USD' ? 'is-active' : ''}" data-currency="USD">USD $</button>
          </div>
        </div>

        <div class="gs-ops__controls-strip">
          <div class="gs-ops__field">
            <span class="gs-ops__field-label">CHANNEL FEE MODEL</span>
            <div class="gs-ops__seg-group">
              <button type="button" class="gs-ops__seg-btn ${ms.channel === 'tiktok' ? 'is-active' : ''}" data-econ-channel="tiktok">TikTok Shop</button>
              <button type="button" class="gs-ops__seg-btn ${ms.channel === 'etsy' ? 'is-active' : ''}" data-econ-channel="etsy">Etsy</button>
              <button type="button" class="gs-ops__seg-btn ${ms.channel === 'direct' ? 'is-active' : ''}" data-econ-channel="direct">Direct</button>
            </div>
          </div>

          <label class="gs-ops__field">
            <span class="gs-ops__field-label">BUYER SHIPPING CHARGED (${isUsd ? 'USD' : 'GBP'})</span>
            <input
              type="number"
              min="0"
              step="0.5"
              class="gs-ops__input gs-ops__input--mono"
              id="ops-buyer-shipping"
              value="${(ms.buyerShippingGbp * rate).toFixed(2)}"
            />
          </label>

          ${
            ms.channel === 'tiktok'
              ? `
            <label class="gs-ops__field">
              <span class="gs-ops__field-label">TIKTOK PLATFORM FEE (%)</span>
              <input type="number" min="0" max="30" step="0.5" class="gs-ops__input gs-ops__input--mono" id="ops-tiktok-fee" value="${ms.tiktokFeePct}" />
            </label>
            <label class="gs-ops__field">
              <span class="gs-ops__field-label">CREATOR AFFILIATE (%)</span>
              <input type="number" min="0" max="40" step="1" class="gs-ops__input gs-ops__input--mono" id="ops-tiktok-aff" value="${ms.tiktokAffiliatePct}" />
            </label>
          `
              : ''
          }

          ${
            ms.channel === 'etsy'
              ? `
            <label class="gs-ops__field">
              <span class="gs-ops__field-label">ETSY OFFSITE ADS (+15%)</span>
              <button type="button" id="ops-etsy-ads-btn" class="gs-ops__ch-toggle ${ms.includeEtsyOffsiteAds ? 'is-on' : ''}">
                ${ms.includeEtsyOffsiteAds ? 'Enabled (6.5% + 15%)' : 'Off (Standard 6.5% + 4%)'}
              </button>
            </label>
          `
              : ''
          }

          <label class="gs-ops__field">
            <span class="gs-ops__field-label">TARGET MARGIN FLOOR (%)</span>
            <input type="number" min="0" max="80" step="1" class="gs-ops__input gs-ops__input--mono" id="ops-target-margin" value="${ms.targetMarginPct}" />
          </label>
        </div>

        <div class="gs-ops__table-wrap">
          <table class="gs-ops__table">
            <thead>
              <tr>
                <th>Product / SKU</th>
                <th class="is-right">Retail (${isUsd ? '$' : '£'})</th>
                <th class="is-right">POD + Ship (${isUsd ? '$' : '£'})</th>
                <th class="is-right">Fees</th>
                <th class="is-right">Net Profit</th>
                <th class="is-right">Margin</th>
                <th class="is-right">Max ROAS</th>
                <th class="is-right">Status</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </section>
    `;

    contentEl.querySelectorAll('[data-currency]').forEach((btn) => {
      btn.addEventListener('click', () => {
        updateMarginSettings({ currency: btn.dataset.currency });
      });
    });

    contentEl.querySelectorAll('[data-econ-channel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        updateMarginSettings({ channel: btn.dataset.econChannel });
      });
    });

    const buyerShipInput = contentEl.querySelector('#ops-buyer-shipping');
    if (buyerShipInput) {
      buyerShipInput.addEventListener('change', () => {
        const raw = Math.max(0, Number(buyerShipInput.value) || 0);
        updateMarginSettings({ buyerShippingGbp: raw / rate });
      });
    }

    const ttFeeInput = contentEl.querySelector('#ops-tiktok-fee');
    if (ttFeeInput) {
      ttFeeInput.addEventListener('change', () => {
        updateMarginSettings({ tiktokFeePct: Math.max(0, Number(ttFeeInput.value) || 0) });
      });
    }

    const ttAffInput = contentEl.querySelector('#ops-tiktok-aff');
    if (ttAffInput) {
      ttAffInput.addEventListener('change', () => {
        updateMarginSettings({ tiktokAffiliatePct: Math.max(0, Number(ttAffInput.value) || 0) });
      });
    }

    const etsyAdsBtn = contentEl.querySelector('#ops-etsy-ads-btn');
    if (etsyAdsBtn) {
      etsyAdsBtn.addEventListener('click', () => {
        updateMarginSettings({ includeEtsyOffsiteAds: !ms.includeEtsyOffsiteAds });
      });
    }

    const targetMarginInput = contentEl.querySelector('#ops-target-margin');
    if (targetMarginInput) {
      targetMarginInput.addEventListener('change', () => {
        updateMarginSettings({ targetMarginPct: Math.max(0, Number(targetMarginInput.value) || 0) });
      });
    }

    contentEl.querySelectorAll('[data-econ-field]').forEach((input) => {
      input.addEventListener('change', () => {
        const pid = input.dataset.pid;
        const field = input.dataset.econField;
        const val = Math.max(0, Number(input.value) || 0);
        updateSkuConfig(pid, { [field]: val / rate });
      });
    });
  }

  function renderExportView(snap) {
    const audit = runPreflightAudit(snap);

    const issuesHtml = audit.issues
      .map(
        (issue) => `
          <div class="gs-ops__audit-row is-issue">
            <div class="gs-ops__audit-main">
              <div class="gs-ops__audit-kicker">${escapeHtml(issue.severity)} · ${escapeHtml(issue.area)}</div>
              <div class="gs-ops__audit-msg">${escapeHtml(issue.message)}</div>
            </div>
            ${
              issue.jumpTab
                ? `<button type="button" class="gs-ops__inline-btn" data-jump-tab="${escapeHtml(issue.jumpTab)}">Resolve →</button>`
                : ''
            }
          </div>
        `
      )
      .join('');

    const passesHtml = audit.passes
      .map(
        (pass) => `
          <div class="gs-ops__audit-row is-pass">
            <div class="gs-ops__audit-main">
              <div class="gs-ops__audit-kicker">Verified · ${escapeHtml(pass.area)}</div>
              <div class="gs-ops__audit-msg">${escapeHtml(pass.message)}</div>
            </div>
          </div>
        `
      )
      .join('');

    const policyRowsHtml = CHANNEL_POLICY_SUMMARY.map(
      (p) => `
        <div class="gs-ops__policy-cell">
          <div class="gs-ops__policy-name">${escapeHtml(p.channel)}</div>
          <div class="gs-ops__policy-role">${escapeHtml(p.role)}</div>
          <div class="gs-ops__policy-meta">SLA: ${escapeHtml(p.dispatchWindow)}</div>
          <p class="gs-ops__policy-note">${escapeHtml(p.keyWatchout)}</p>
        </div>
      `
    ).join('');

    contentEl.innerHTML = `
      <section class="gs-ops__section">
        <div class="gs-ops__section-head">
          <div>
            <h2 class="gs-ops__h2">Channel Sync &amp; Bulk Export Pack</h2>
            <p class="gs-ops__lead">Run a live readiness audit across your catalog and export channel-ready CSVs and routing manifests.</p>
          </div>
          <div class="gs-ops__export-reset">
            ${
              resetConfirmArmed
                ? `
                  <button type="button" id="ops-reset-confirm" class="gs-ops__inline-btn is-danger">Confirm Reset</button>
                  <button type="button" id="ops-reset-cancel" class="gs-ops__inline-btn">Cancel</button>
                `
                : `<button type="button" id="ops-reset-arm" class="gs-ops__inline-btn">Reset Ops Data</button>`
            }
          </div>
        </div>

        <div class="gs-ops__export-grid">
          <div class="gs-ops__export-card">
            <div class="gs-ops__export-title">Etsy Bulk Listing CSV</div>
            <p class="gs-ops__export-desc">Includes titles, descriptions, 13 search tags, variation SKUs, processing profiles, and Production Partner disclosure state.</p>
            <button type="button" id="ops-dl-etsy" class="gs-ops__btn-solid">Download Etsy CSV</button>
          </div>

          <div class="gs-ops__export-card">
            <div class="gs-ops__export-title">TikTok Shop SKU Template CSV</div>
            <p class="gs-ops__export-desc">Expanded variant-level rows (GS-01-SW-S, M, L, XL) with weights, categories, stock buffers, and handling SLAs.</p>
            <button type="button" id="ops-dl-tiktok" class="gs-ops__btn-solid">Download TikTok CSV</button>
          </div>

          <div class="gs-ops__export-card">
            <div class="gs-ops__export-title">Printify &amp; Printful Routing JSON</div>
            <p class="gs-ops__export-desc">Canonical SKU mapping connecting primary and backup POD providers, DPI print specs, and target unit economics.</p>
            <button type="button" id="ops-dl-routing" class="gs-ops__btn-solid">Download Routing JSON</button>
          </div>
        </div>

        ${exportNotice ? `<div class="gs-ops__notice" role="status">${escapeHtml(exportNotice)}</div>` : ''}

        <div class="gs-ops__subblock">
          <h3 class="gs-ops__h3">Live Preflight Audit (${audit.issues.length} Action Items · ${audit.passes.length} Verified)</h3>
          <div class="gs-ops__audit-list">
            ${issuesHtml}
            ${passesHtml}
          </div>
        </div>

        <div class="gs-ops__subblock">
          <h3 class="gs-ops__h3">Platform Rules &amp; Dispatch Cheat Sheet</h3>
          <div class="gs-ops__policy-grid">
            ${policyRowsHtml}
          </div>
        </div>
      </section>
    `;

    contentEl.querySelectorAll('[data-jump-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setSupplyOpsTab(btn.dataset.jumpTab);
      });
    });

    const dlEtsy = contentEl.querySelector('#ops-dl-etsy');
    if (dlEtsy) {
      dlEtsy.addEventListener('click', () => {
        downloadTextFile('gemini-supply-etsy-listings.csv', buildEtsyCsv(getSupplyOpsSnapshot()), 'text/csv;charset=utf-8');
        exportNotice = 'Exported gemini-supply-etsy-listings.csv (8 listings with 13 tags & partner status).';
        renderExportView(getSupplyOpsSnapshot());
      });
    }

    const dlTikTok = contentEl.querySelector('#ops-dl-tiktok');
    if (dlTikTok) {
      dlTikTok.addEventListener('click', () => {
        downloadTextFile('gemini-supply-tiktok-skus.csv', buildTikTokCsv(getSupplyOpsSnapshot()), 'text/csv;charset=utf-8');
        exportNotice = 'Exported gemini-supply-tiktok-skus.csv (all enabled size variants & handling SLAs).';
        renderExportView(getSupplyOpsSnapshot());
      });
    }

    const dlRouting = contentEl.querySelector('#ops-dl-routing');
    if (dlRouting) {
      dlRouting.addEventListener('click', () => {
        downloadTextFile('gemini-supply-pod-routing.json', buildProviderRoutingJson(getSupplyOpsSnapshot()), 'application/json;charset=utf-8');
        exportNotice = 'Exported gemini-supply-pod-routing.json (Printify/Printful SKU routing manifest).';
        renderExportView(getSupplyOpsSnapshot());
      });
    }

    const armBtn = contentEl.querySelector('#ops-reset-arm');
    if (armBtn) {
      armBtn.addEventListener('click', () => {
        resetConfirmArmed = true;
        renderExportView(getSupplyOpsSnapshot());
      });
    }

    const cancelBtn = contentEl.querySelector('#ops-reset-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        resetConfirmArmed = false;
        renderExportView(getSupplyOpsSnapshot());
      });
    }

    const confirmBtn = contentEl.querySelector('#ops-reset-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        resetConfirmArmed = false;
        exportNotice = 'Supply Ops configuration restored to default Gemini Supply baseline.';
        resetSupplyOpsState();
      });
    }
  }

  function render(snap) {
    navBtns.forEach((btn) => {
      const active = btn.dataset.tab === snap.activeTab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (crumbActiveEl) {
      crumbActiveEl.textContent = TAB_TITLES[snap.activeTab] || 'Launch Checklist';
    }
    renderSidebarSummary(snap);

    if (snap.activeTab === 'checklist') {
      renderChecklistView(snap);
    } else if (snap.activeTab === 'skus') {
      renderSkuMatrixView(snap);
    } else if (snap.activeTab === 'margins') {
      renderMarginsView(snap);
    } else {
      renderExportView(snap);
    }
  }

  function applyVisibility({ open, instant }) {
    const useInstant = Boolean(instant || IS_SCREENSHOT_MODE || prefersReducedMotion());
    overlayEl.classList.toggle('is-instant', useInstant);

    if (open) {
      lastFocusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      overlayEl.setAttribute('aria-hidden', 'false');
      if (!useInstant) {
        overlayEl.classList.remove('is-open');
        void overlayEl.offsetWidth;
      }
      overlayEl.classList.add('is-open');
      onLockScroll?.(true);
      if (!IS_SCREENSHOT_MODE && closeBtn) {
        closeBtn.focus({ preventScroll: true });
      }
    } else {
      overlayEl.classList.remove('is-open');
      overlayEl.setAttribute('aria-hidden', 'true');
      onLockScroll?.(false);
      if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
        lastFocusedEl.focus({ preventScroll: true });
        lastFocusedEl = null;
      }
    }
  }

  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      exportNotice = '';
      resetConfirmArmed = false;
      setSupplyOpsTab(btn.dataset.tab);
    });
  });

  if (auditJumpBtn) {
    auditJumpBtn.addEventListener('click', () => {
      exportNotice = '';
      setSupplyOpsTab('export');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeSupplyOps(IS_SCREENSHOT_MODE || prefersReducedMotion());
    });
  }

  function onKeyDown(e) {
    if (!isSupplyOpsOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSupplyOps(true);
    }
  }

  window.addEventListener('keydown', onKeyDown);

  const unsubStore = subscribeSupplyOps(render);
  const unsubModal = subscribeSupplyOpsModal(applyVisibility);

  if (isSupplyOpsOpen()) {
    applyVisibility({ open: true, instant: true });
  }

  return {
    destroy() {
      unsubStore();
      unsubModal();
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
