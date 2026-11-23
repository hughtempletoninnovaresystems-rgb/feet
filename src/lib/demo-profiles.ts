// Fictional sample creators for the public demo. No real people, photos or purchases are involved.
export type DemoProfile = {
  slug: string;
  name: string;
  handle: string;
  location: string;
  category: string;
  bio: string;
  likes: number;
  colour: string;
  content: { title: string; kind: "PHOTO SET" | "VIDEO"; tokens: number }[];
  comments: { name: string; body: string }[];
};

export const demoProfiles: DemoProfile[] = [
  {
    slug: "ava", name: "Ava", handle: "@demo-ava", location: "London, UK", category: "Pedicure & polish", likes: 248, colour: "#e9c9bd",
    bio: "A sample profile. Ava would share nail colour diaries, polish swatches and relaxed behind-the-scenes updates. Everything on this page is a placeholder.",
    content: [{ title: "Spring colour swatches", kind: "PHOTO SET", tokens: 40 }, { title: "Polish day, start to finish", kind: "VIDEO", tokens: 90 }, { title: "Seasonal favourites", kind: "PHOTO SET", tokens: 55 }],
    comments: [{ name: "Sample fan", body: "Love the colour choices. This is a demo comment." }, { name: "Another fan", body: "Great layout! Demo comment only." }],
  },
  {
    slug: "ruby", name: "Ruby", handle: "@demo-ruby", location: "Manchester, UK", category: "Cosy & casual", likes: 173, colour: "#d9d2e6",
    bio: "A sample profile. Ruby would post cosy-sock mornings, travel snaps and Q&A sessions. This text is an example of how a creator introduces themselves.",
    content: [{ title: "Weekend comfort set", kind: "PHOTO SET", tokens: 35 }, { title: "Q&A recording", kind: "VIDEO", tokens: 75 }],
    comments: [{ name: "Sample fan", body: "Looking forward to launch. Demo comment." }],
  },
  {
    slug: "nina", name: "Nina", handle: "@demo-nina", location: "Glasgow, UK", category: "Creative & artistic", likes: 312, colour: "#cfe0d6",
    bio: "A sample profile. Nina would share artistic shots, studio set-ups and requests from subscribers. Nothing here is a real offer.",
    content: [{ title: "Studio light test", kind: "PHOTO SET", tokens: 60 }, { title: "Making of a photo set", kind: "VIDEO", tokens: 100 }, { title: "Colour and texture", kind: "PHOTO SET", tokens: 45 }],
    comments: [{ name: "Sample fan", body: "Beautiful composition. Demo comment." }, { name: "Another fan", body: "Cannot wait to see more. Demo comment." }],
  },
];

export function getDemoProfile(slug: string) {
  return demoProfiles.find((profile) => profile.slug === slug) ?? null;
}
