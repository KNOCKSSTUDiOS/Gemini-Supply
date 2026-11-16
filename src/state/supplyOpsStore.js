/**
 * Gemini Supply - Supply Ops Reactive Store
 * Persists checklist progress, per-SKU provider/cost config, and margin calculator state.
 */

import { PRODUCTS } from '../data/catalog.js';
import {
  DEFAULT_SKU_PROFILES,
  FIRST_TIMER_CHECKLIST,
} from '../data/supplyOpsData.js';

const STORAGE_KEY = 'gemini_supply_ops_v1';

function buildDefaultSkuConfigs() {
  const configs = {};
  PRODUCTS.forEach((product) => {
    const profile = DEFAULT_SKU_PROFILES[product.id];
    configs[product.id] = {
      productId: product.id,
      skuPrefix: profile.skuPrefix,
      primaryProvider: profile.primaryProvider,
      backupProvider: profile.backupProvider,
      retailPriceGbp: Number((product.priceCents / 100).toFixed(2)),
      unitCostGbp: profile.unitCostGbp,
      prodDaysMin: profile.prodDaysMin,
      prodDaysMax: profile.prodDaysMax,
      stockBuffer: profile.stockBuffer,
      printFileReady: false,
      sampleOrdered: false,
      etsyPartnerDisclosed: false,
      channels: {
        printify: profile.primaryProvider === 'Printify' || profile.backupProvider === 'Printify',
        printful: profile.primaryProvider === 'Printful' || profile.backupProvider === 'Printful',
        tiktok: true,
        etsy: true,
      },
    };
  });
  return configs;
}

function getDefaultState() {
  return {
    activeTab: 'checklist',
    checklistFilter: 'all',
    completedChecklistIds: [],
    customChecklistItems: [],
    skuConfigs: buildDefaultSkuConfigs(),
    marginSettings: {
      channel: 'tiktok',
      currency: 'GBP',
      gbpToUsd: 1.27,
      buyerShippingGbp: 0,
      includeEtsyOffsiteAds: false,
      tiktokFeePct: 6,
      tiktokAffiliatePct: 10,
      targetMarginPct: 30,
    },
  };
}

function loadState() {
  const defaults = getDefaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;

    const mergedSkus = { ...defaults.skuConfigs };
    if (parsed.skuConfigs && typeof parsed.skuConfigs === 'object') {
      Object.keys(mergedSkus).forEach((pid) => {
        if (parsed.skuConfigs[pid]) {
          mergedSkus[pid] = {
            ...mergedSkus[pid],
            ...parsed.skuConfigs[pid],
            channels: {
              ...mergedSkus[pid].channels,
              ...(parsed.skuConfigs[pid].channels || {}),
            },
          };
        }
      });
    }

    return {
      ...defaults,
      activeTab: ['checklist', 'skus', 'margins', 'export'].includes(parsed.activeTab)
        ? parsed.activeTab
        : defaults.activeTab,
      checklistFilter: typeof parsed.checklistFilter === 'string' ? parsed.checklistFilter : 'all',
      completedChecklistIds: Array.isArray(parsed.completedChecklistIds)
        ? parsed.completedChecklistIds
        : [],
      customChecklistItems: Array.isArray(parsed.customChecklistItems)
        ? parsed.customChecklistItems
        : [],
      skuConfigs: mergedSkus,
      marginSettings: {
        ...defaults.marginSettings,
        ...(parsed.marginSettings || {}),
      },
    };
  } catch {
    return defaults;
  }
}

let state = loadState();
let modalOpen = false;
const listeners = new Set();
const modalListeners = new Set();

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

function notify() {
  persist();
  const snap = getSupplyOpsSnapshot();
  listeners.forEach((fn) => fn(snap));
}

export function getSupplyOpsSnapshot() {
  return {
    ...state,
    open: modalOpen,
  };
}

export function subscribeSupplyOps(fn) {
  listeners.add(fn);
  fn(getSupplyOpsSnapshot());
  return () => listeners.delete(fn);
}

export function subscribeSupplyOpsModal(fn) {
  modalListeners.add(fn);
  return () => modalListeners.delete(fn);
}

export function isSupplyOpsOpen() {
  return modalOpen;
}

export function openSupplyOps(tab = null, instant = false) {
  if (tab && ['checklist', 'skus', 'margins', 'export'].includes(tab)) {
    state = { ...state, activeTab: tab };
    persist();
  }
  modalOpen = true;
  modalListeners.forEach((fn) => fn({ open: true, instant }));
  notify();
}

export function closeSupplyOps(instant = false) {
  if (!modalOpen) return;
  modalOpen = false;
  modalListeners.forEach((fn) => fn({ open: false, instant }));
}

export function setSupplyOpsTab(tab) {
  if (!['checklist', 'skus', 'margins', 'export'].includes(tab)) return;
  state = { ...state, activeTab: tab };
  notify();
}

export function setChecklistFilter(filter) {
  state = { ...state, checklistFilter: filter };
  notify();
}

export function toggleChecklistItem(id) {
  const exists = state.completedChecklistIds.includes(id);
  const completedChecklistIds = exists
    ? state.completedChecklistIds.filter((item) => item !== id)
    : [...state.completedChecklistIds, id];
  state = { ...state, completedChecklistIds };
  notify();
}

export function addCustomChecklistItem(title, channel = 'Foundation') {
  const trimmed = String(title || '').trim();
  if (!trimmed) return;
  const item = {
    id: `custom-${Date.now()}`,
    channel,
    priority: 'Recommended',
    title: trimmed,
    detail: 'Custom operational readiness task.',
    isCustom: true,
  };
  state = {
    ...state,
    customChecklistItems: [...state.customChecklistItems, item],
  };
  notify();
}

export function removeCustomChecklistItem(id) {
  state = {
    ...state,
    customChecklistItems: state.customChecklistItems.filter((item) => item.id !== id),
    completedChecklistIds: state.completedChecklistIds.filter((cid) => cid !== id),
  };
  notify();
}

export function updateSkuConfig(productId, patch) {
  const current = state.skuConfigs[productId];
  if (!current) return;
  state = {
    ...state,
    skuConfigs: {
      ...state.skuConfigs,
      [productId]: {
        ...current,
        ...patch,
        channels: {
          ...current.channels,
          ...(patch.channels || {}),
        },
      },
    },
  };
  notify();
}

export function updateMarginSettings(patch) {
  state = {
    ...state,
    marginSettings: {
      ...state.marginSettings,
      ...patch,
    },
  };
  notify();
}

export function resetSupplyOpsState() {
  state = getDefaultState();
  notify();
}

export function getAllChecklistItems(snap = state) {
  return [...FIRST_TIMER_CHECKLIST, ...snap.customChecklistItems];
}

export function calculateUnitEconomics(skuConfig, marginSettings) {
  const retail = Math.max(0, Number(skuConfig.retailPriceGbp) || 0);
  const buyerShipping = Math.max(0, Number(marginSettings.buyerShippingGbp) || 0);
  const revenueGbp = retail + buyerShipping;
  const costGbp = Math.max(0, Number(skuConfig.unitCostGbp) || 0);

  let platformFeeGbp = 0;
  let paymentFeeGbp = 0;
  let affiliateFeeGbp = 0;

  if (marginSettings.channel === 'etsy') {
    // Etsy: 6.5% transaction fee on item + shipping, ~4% + £0.20 UK payment processing, £0.16 listing fee
    platformFeeGbp = revenueGbp * 0.065 + 0.16;
    if (marginSettings.includeEtsyOffsiteAds) {
      platformFeeGbp += revenueGbp * 0.15;
    }
    paymentFeeGbp = revenueGbp * 0.04 + 0.2;
  } else if (marginSettings.channel === 'tiktok') {
    const feeRate = Math.max(0, Number(marginSettings.tiktokFeePct) || 0) / 100;
    const affiliateRate = Math.max(0, Number(marginSettings.tiktokAffiliatePct) || 0) / 100;
    platformFeeGbp = revenueGbp * feeRate;
    // TikTok affiliate commission applies to item price
    affiliateFeeGbp = retail * affiliateRate;
    paymentFeeGbp = 0; // Included in TikTok Shop settlement fee structure
  } else {
    // Direct storefront card processing (~2.9% + £0.25)
    paymentFeeGbp = revenueGbp * 0.029 + 0.25;
  }

  const totalDeductions = costGbp + platformFeeGbp + paymentFeeGbp + affiliateFeeGbp;
  const netProfitGbp = revenueGbp - totalDeductions;
  const netMarginPct = revenueGbp > 0 ? (netProfitGbp / revenueGbp) * 100 : 0;
  const breakEvenRoas = netProfitGbp > 0 ? revenueGbp / netProfitGbp : 0;

  let status = 'Healthy';
  if (netProfitGbp <= 0) {
    status = 'Negative';
  } else if (netMarginPct < (Number(marginSettings.targetMarginPct) || 25)) {
    status = 'Tight';
  }

  return {
    revenueGbp,
    costGbp,
    platformFeeGbp,
    paymentFeeGbp,
    affiliateFeeGbp,
    netProfitGbp,
    netMarginPct,
    breakEvenRoas,
    status,
  };
}

export function formatCurrency(amountGbp, marginSettings) {
  const isUsd = marginSettings.currency === 'USD';
  const rate = isUsd ? Number(marginSettings.gbpToUsd) || 1.27 : 1;
  const val = amountGbp * rate;
  const symbol = isUsd ? '$' : '£';
  const prefix = val < 0 ? '-' : '';
  return `${prefix}${symbol}${Math.abs(val).toFixed(2)}`;
}

export function runPreflightAudit(snap = state) {
  const issues = [];
  const passes = [];

  const allChecklist = getAllChecklistItems(snap);
  const completedCount = allChecklist.filter((c) => snap.completedChecklistIds.includes(c.id)).length;
  const criticalRemaining = allChecklist.filter(
    (c) => c.priority === 'Critical' && !snap.completedChecklistIds.includes(c.id)
  );

  if (criticalRemaining.length === 0) {
    passes.push({
      area: 'Checklist',
      message: `All critical launch checklist items completed (${completedCount}/${allChecklist.length} total).`,
    });
  } else {
    issues.push({
      severity: 'Action Required',
      area: 'Checklist',
      message: `${criticalRemaining.length} critical setup step${criticalRemaining.length === 1 ? '' : 's'} unchecked (next: "${criticalRemaining[0].title}").`,
      jumpTab: 'checklist',
    });
  }

  let printReadyCount = 0;
  let etsyDisclosedCount = 0;
  const negativeMarginProducts = [];
  const tightSlaProducts = [];
  const noBackupProducts = [];

  PRODUCTS.forEach((product) => {
    const cfg = snap.skuConfigs[product.id];
    if (!cfg) return;
    if (cfg.printFileReady) printReadyCount += 1;
    if (cfg.etsyPartnerDisclosed) etsyDisclosedCount += 1;

    if (cfg.backupProvider === 'None' && cfg.primaryProvider !== 'Self / 3PL') {
      noBackupProducts.push(`${cfg.skuPrefix} (${product.title})`);
    }
    if (cfg.channels.tiktok && cfg.prodDaysMax > 3) {
      tightSlaProducts.push(`${cfg.skuPrefix} (${cfg.prodDaysMin}–${cfg.prodDaysMax}d)`);
    }

    const econ = calculateUnitEconomics(cfg, snap.marginSettings);
    if (econ.netProfitGbp <= 0) {
      negativeMarginProducts.push(`${cfg.skuPrefix} (${formatCurrency(econ.netProfitGbp, snap.marginSettings)})`);
    }
  });

  if (printReadyCount === PRODUCTS.length) {
    passes.push({
      area: 'Print Files',
      message: 'All 8 product print/embroidery files verified at 300 DPI / .DST spec.',
    });
  } else {
    issues.push({
      severity: 'Action Required',
      area: 'Print Files',
      message: `${PRODUCTS.length - printReadyCount} of ${PRODUCTS.length} products do not yet have Print File Ready confirmed.`,
      jumpTab: 'skus',
    });
  }

  if (etsyDisclosedCount === PRODUCTS.length) {
    passes.push({
      area: 'Etsy Policy',
      message: 'All 8 listings marked with Etsy Production Partner disclosure.',
    });
  } else {
    issues.push({
      severity: 'Policy Risk',
      area: 'Etsy Policy',
      message: `${PRODUCTS.length - etsyDisclosedCount} Etsy listings still need Production Partner disclosure toggled.`,
      jumpTab: 'skus',
    });
  }

  if (tightSlaProducts.length > 0) {
    issues.push({
      severity: 'SLA Warning',
      area: 'TikTok Dispatch',
      message: `${tightSlaProducts.length} TikTok-enabled SKUs exceed 3-day production (${tightSlaProducts.join(', ')}). Enable Made-to-Order or pre-stock buffer.`,
      jumpTab: 'skus',
    });
  } else {
    passes.push({
      area: 'TikTok Dispatch',
      message: 'All TikTok-enabled SKUs meet 3-day dispatch SLA.',
    });
  }

  if (negativeMarginProducts.length > 0) {
    issues.push({
      severity: 'Margin Loss',
      area: 'Unit Economics',
      message: `Negative profit detected on ${snap.marginSettings.channel.toUpperCase()} for: ${negativeMarginProducts.join(', ')}. Raise price or charge buyer shipping.`,
      jumpTab: 'margins',
    });
  } else {
    passes.push({
      area: 'Unit Economics',
      message: `All 8 SKUs are profit-positive under current ${snap.marginSettings.channel.toUpperCase()} fee settings.`,
    });
  }

  if (noBackupProducts.length > 0) {
    issues.push({
      severity: 'Supply Risk',
      area: 'Backup Provider',
      message: `Single-source POD SKU with no backup provider: ${noBackupProducts.join(', ')}.`,
      jumpTab: 'skus',
    });
  }

  return { issues, passes };
}

function escapeCsvCell(value) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildEtsyCsv(snap = state) {
  const headers = [
    'SKU',
    'Title',
    'Category',
    'Retail_GBP',
    'Sizes',
    'Primary_Production_Partner',
    'Partner_Disclosed',
    'Processing_Days',
    'Description',
    'Tags_13_Slot',
  ];
  const rows = PRODUCTS.map((product) => {
    const cfg = snap.skuConfigs[product.id];
    const profile = DEFAULT_SKU_PROFILES[product.id];
    const variantSkus = product.sizes.map((s) => `${cfg.skuPrefix}-${s.replace(/[^A-Z0-9]/gi, '')}`).join(' | ');
    return [
      variantSkus,
      product.title,
      product.category,
      cfg.retailPriceGbp.toFixed(2),
      product.sizes.join(' | '),
      cfg.primaryProvider,
      cfg.etsyPartnerDisclosed ? 'YES' : 'NO',
      `${cfg.prodDaysMin}-${cfg.prodDaysMax} business days`,
      product.spec,
      profile.etsyTags,
    ]
      .map(escapeCsvCell)
      .join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

export function buildTikTokCsv(snap = state) {
  const headers = [
    'Seller_SKU',
    'Product_Name',
    'TikTok_Category',
    'Variant_Value',
    'Price_GBP',
    'Stock_Buffer_Qty',
    'Weight_Grams',
    'Fulfillment_Provider',
    'Handling_SLA',
    'Print_Spec',
  ];
  const rows = [];
  PRODUCTS.forEach((product) => {
    const cfg = snap.skuConfigs[product.id];
    const profile = DEFAULT_SKU_PROFILES[product.id];
    if (!cfg.channels.tiktok) return;
    product.sizes.forEach((size) => {
      const cleanSize = size.replace(/[^A-Z0-9]/gi, '');
      rows.push(
        [
          `${cfg.skuPrefix}-${cleanSize}`,
          product.title,
          profile.tiktokCategory,
          size,
          cfg.retailPriceGbp.toFixed(2),
          cfg.stockBuffer,
          profile.weightGrams,
          cfg.primaryProvider,
          cfg.prodDaysMax > 3 ? 'Made-to-Order / 5d' : 'Standard 3d',
          profile.printFileSpec,
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    });
  });
  return [headers.join(','), ...rows].join('\n');
}

export function buildProviderRoutingJson(snap = state) {
  const manifest = {
    store: 'Gemini Supply',
    exportedAt: new Date().toISOString(),
    channels: ['Printify', 'Printful', 'TikTok Shop', 'Etsy'],
    marginAssumptions: snap.marginSettings,
    products: PRODUCTS.map((product) => {
      const cfg = snap.skuConfigs[product.id];
      const profile = DEFAULT_SKU_PROFILES[product.id];
      return {
        id: product.id,
        title: product.title,
        canonicalSkuPrefix: cfg.skuPrefix,
        variants: product.sizes.map((size) => ({
          size,
          sku: `${cfg.skuPrefix}-${size.replace(/[^A-Z0-9]/gi, '')}`,
        })),
        fulfillment: {
          primary: cfg.primaryProvider,
          backup: cfg.backupProvider,
          productionMethod: profile.productionMethod,
          printFileSpec: profile.printFileSpec,
          printFileReady: cfg.printFileReady,
          sampleOrdered: cfg.sampleOrdered,
          productionDays: `${cfg.prodDaysMin}-${cfg.prodDaysMax}`,
          stockBuffer: cfg.stockBuffer,
        },
        economicsGbp: {
          retailPrice: cfg.retailPriceGbp,
          unitCostWithShip: cfg.unitCostGbp,
        },
        enabledChannels: cfg.channels,
        slaAdvisory: profile.slaAdvisory,
      };
    }),
  };
  return JSON.stringify(manifest, null, 2);
}
