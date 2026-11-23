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
  image: string;
  rate: number;
  tint: string;
  tagline: string;
  content: { title: string; kind: "PHOTO SET" | "VIDEO"; tokens: number }[];
  comments: { name: string; body: string }[];
};

export const demoProfiles: DemoProfile[] = [
  {
    slug: "amelia-rose", name: "Amelia Rose", handle: "@demo-amelia", location: "Brighton, UK", category: "Pedicure & polish", likes: 248, colour: "#e9c9bd", image: "photo-1534528741775-53994a69daeb", rate: 18, tint: "peach", tagline: "Pedicure stories",
    bio: "A sample profile. Amelia would share nail colour diaries, polish swatches and relaxed behind-the-scenes updates. Everything on this page is a placeholder.",
    content: [{ title: "Spring colour swatches", kind: "PHOTO SET", tokens: 40 }, { title: "Polish day, start to finish", kind: "VIDEO", tokens: 90 }, { title: "Seasonal favourites", kind: "PHOTO SET", tokens: 55 }],
    comments: [{ name: "Sample fan", body: "Love the colour choices. This is a demo comment." }, { name: "Another fan", body: "Great layout! Demo comment only." }],
  },
  {
    slug: "sofia-lane", name: "Sofia Lane", handle: "@demo-sofia", location: "London, UK", category: "Cosy & casual", likes: 173, colour: "#d9d2e6", image: "photo-1524504388940-b1c1722653e1", rate: 14, tint: "lilac", tagline: "Soft & sunny",
    bio: "A sample profile. Sofia would post cosy-sock mornings, travel snaps and Q&A sessions. This text is an example of how a creator introduces themselves.",
    content: [{ title: "Weekend comfort set", kind: "PHOTO SET", tokens: 35 }, { title: "Q&A recording", kind: "VIDEO", tokens: 75 }],
    comments: [{ name: "Sample fan", body: "Looking forward to launch. Demo comment." }],
  },
  {
    slug: "mia-sol", name: "Mia Sol", handle: "@demo-mia", location: "Manchester, UK", category: "Creative & artistic", likes: 312, colour: "#cfe0d6", image: "photo-1531123897727-8f129e1688ce", rate: 22, tint: "butter", tagline: "Barefoot days",
    bio: "A sample profile. Mia would share artistic shots, studio set-ups and requests from subscribers. Nothing here is a real offer.",
    content: [{ title: "Studio light test", kind: "PHOTO SET", tokens: 60 }, { title: "Making of a photo set", kind: "VIDEO", tokens: 100 }, { title: "Colour and texture", kind: "PHOTO SET", tokens: 45 }],
    comments: [{ name: "Sample fan", body: "Beautiful composition. Demo comment." }, { name: "Another fan", body: "Cannot wait to see more. Demo comment." }],
  },
];

export function getDemoProfile(slug: string) {
  return demoProfiles.find((profile) => profile.slug === slug) ?? null;
}

export function demoImageUrl(image: string, width: number) {
  return `https://images.unsplash.com/${image}?auto=format&fit=crop&w=${width}&q=80`;
}
