import { z } from "zod";

const FoundPerson = z.object({
  name: z.string().min(2),
  relationship: z.string().min(2),
  role: z.string().min(2),
  importance: z.number().min(1).max(10).default(8),
});

const FoundPet = z.object({
  name: z.string().min(2),
  species: z.string().min(2),
  breed: z.string().optional(),
  importance: z.number().min(1).max(10).default(7),
});

const FriendBasicsResult = z.object({
  people: z.array(FoundPerson).default([]),
  pets: z.array(FoundPet).default([]),
});

type Basics = z.infer<typeof FriendBasicsResult>;

export function extractFriendBasics(userText: string): Basics {
  const t = userText.trim();
  const people: Basics["people"] = [];
  const pets: Basics["pets"] = [];

  const personPatterns: Array<{ re: RegExp; relationship: string; role: string; importance: number }> = [
    { re: /\bmy\s+daughter\s+([A-Z][a-zA-Z'-]{1,30})\b/g, relationship: "daughter", role: "child", importance: 10 },
    { re: /\bmy\s+son\s+([A-Z][a-zA-Z'-]{1,30})\b/g, relationship: "son", role: "child", importance: 10 },
    { re: /\bmy\s+kid\s+([A-Z][a-zA-Z'-]{1,30})\b/g, relationship: "child", role: "child", importance: 10 },
    { re: /\bmy\s+partner\s+([A-Z][a-zA-Z'-]{1,30})\b/g, relationship: "partner", role: "partner", importance: 9 },
    { re: /\bmy\s+husband\s+([A-Z][a-zA-Z'-]{1,30})\b/g, relationship: "husband", role: "partner", importance: 9 },
    { re: /\bmy\s+wife\s+([A-Z][a-zA-Z'-]{1,30})\b/g, relationship: "wife", role: "partner", importance: 9 },
    { re: /\bmy\s+mom\s+([A-Z][a-zA-Z'-]{1,30})\b/g, relationship: "mom", role: "parent", importance: 9 },
    { re: /\bmy\s+mother\s+([A-Z][a-zA-Z'-]{1,30})\b/g, relationship: "mother", role: "parent", importance: 9 },
    { re: /\bmy\s+dad\s+([A-Z][a-zA-Z'-]{1,30})\b/g, relationship: "dad", role: "parent", importance: 9 },
    { re: /\bmy\s+father\s+([A-Z][a-zA-Z'-]{1,30})\b/g, relationship: "father", role: "parent", importance: 9 },
    { re: /\bmy\s+friend\s+([A-Z][a-zA-Z'-]{1,30})\b/g, relationship: "friend", role: "friend", importance: 7 },
  ];

  for (const p of personPatterns) {
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(t)) !== null) {
      people.push({ name: m[1], relationship: p.relationship, role: p.role, importance: p.importance });
    }
  }

  const petPatterns: Array<{ re: RegExp; species: string; importance: number }> = [
    { re: /\bmy\s+dog\s+([A-Z][a-zA-Z'-]{1,30})\b/g, species: "dog", importance: 8 },
    { re: /\bour\s+dog\s+([A-Z][a-zA-Z'-]{1,30})\b/g, species: "dog", importance: 8 },
    { re: /\bmy\s+cat\s+([A-Z][a-zA-Z'-]{1,30})\b/g, species: "cat", importance: 8 },
    { re: /\bour\s+cat\s+([A-Z][a-zA-Z'-]{1,30})\b/g, species: "cat", importance: 8 },
  ];

  for (const p of petPatterns) {
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(t)) !== null) {
      pets.push({ name: m[1], species: p.species, importance: p.importance });
    }
  }

  const uniqPeople = new Map<string, Basics["people"][number]>();
  for (const x of people) uniqPeople.set(`${x.role}:${x.name}`, x);

  const uniqPets = new Map<string, Basics["pets"][number]>();
  for (const x of pets) uniqPets.set(`${x.species}:${x.name}`, x);

  return FriendBasicsResult.parse({
    people: Array.from(uniqPeople.values()),
    pets: Array.from(uniqPets.values()),
  });
}
