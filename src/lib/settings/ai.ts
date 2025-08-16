// Placeholder for future AI/chat features toggles.
// Keep disabled-by-default and only read by components when wiring features.

export const aiFeatures = {
  chatHelp: true, // Floating “Chat/Help” button on storefront/product pages
  deliveryEta: true, // Delivery ETA hint in product/checkout bars
};

// In the future, we might hydrate this from Firestore or remote config.
export default aiFeatures;
