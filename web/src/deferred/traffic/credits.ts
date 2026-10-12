/**
 * DEFERRED (not in the first release; README.md here). TomTom's credit for its traffic layer on the Routes map, to be shown only while
 * TomTom traffic is drawn (TrafficAttribution).
 * PROVISIONAL (2026-10-12): TomTom's terms (clause 17.3) require attribution generated "to the TomTom Copyright API", and the Traffic
 * API's Incident Viewport returns "the full text of the copyright information that must be displayed with the tiles". No fixed
 * wording is published, so this text is a placeholder until the integration reads the Copyright API (docs/LIVE-TRAFFIC-RESEARCH.md).
 * Use of TomTom's names and logos also needs TomTom's prior written approval (clause 17.3).
 */
export const TOMTOM_TRAFFIC_CREDIT = {
  text: "Traffic © TomTom",
  url: "https://www.tomtom.com/en-gb/legal/product-attributions/",
  provisional: true,
} as const;
