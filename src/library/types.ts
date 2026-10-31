// Library page model: a page is a list of sections; search indexes every section (title, headings, text, synonyms).
export interface Section {
  id: string;
  title: string;
  html: string;
  /** Extra search words for this section (synonyms, common phrasings). */
  keywords?: string[];
}
export interface Page {
  /** '' is the home page; 'maps/office' etc. Routes are /library/<slug>/. */
  slug: string;
  title: string;
  /** Short line under the title and in cards/search. */
  summary: string;
  group: 'Start' | 'Play' | 'Know' | 'Maps' | 'Account' | 'Help';
  /** Optional block above the sections (hero, intro figure). */
  lead?: string;
  sections: Section[];
  related: string[];
  /** Page-level search words. */
  keywords?: string[];
}
