// The family's own question list, fact-checked against Scripture and loaded
// via the "Import Our Family's Questions" button in Settings.
//
// All questions import unassigned (into the Library) since assignment is
// now by age group rather than by person — the 8 questions originally
// grouped under "Asher" looked written for a younger reader (garden of
// Eden, "where is God", etc.), so you may want to start there when
// assigning them to an age group, but that's your call to make in Settings.
// A couple of small corrections were made against what was submitted:
//   - "Meshech" -> "Meshach" (Daniel 1:7 — Meshech is a different, unrelated
//     biblical figure/place, a son of Japheth in Genesis 10:2).
//   - Filled in the missing answer for "the fat man Ehud killed" (Eglon,
//     king of Moab — Judges 3:12-25).
//   - Spelled out the dog emoji answer as "Dogs" (2 Kings 9:35-36).
// Everything else was left as submitted — a few answers (e.g. "the first
// thing God created", "what land God promised Abraham", Samson's strength
// being "his hair") are the standard simplified Sunday-school answers,
// though the fuller biblical picture has a bit more nuance; ask Claude if
// you want the fuller explanation for any of these.
const GENERAL = [
  { text: "What was the first thing that God created?", answer: "Light" },
  { text: "In what city was Jesus born?", answer: "Bethlehem" },
  { text: "What was the boat Noah built called?", answer: "An ark" },
  { text: "How many tribes of Israel were there?", answer: "Twelve" },
  { text: "What was Jesus' mom's name?", answer: "Mary" },
  { text: "How many disciples did Jesus have?", answer: "Twelve" },
  { text: "Who received the 10 commandments from God?", answer: "Moses" },
  { text: "Who baptized Jesus?", answer: "John the Baptist" },
  { text: "Who was the worst queen?", answer: "Jezebel" },
  { text: "How many days was Jesus in the wilderness?", answer: "Forty" },
  { text: "How many days was Jesus in the grave?", answer: "Three" },
  { text: "How many days was Jonah in the whale?", answer: "Three" },
  { text: "How many years did Israel wander in the wilderness?", answer: "Forty" },
  { text: "How many days did God take to create the world before he rested?", answer: "Six" },
  { text: "Where was Daniel sent because he would not pray to the king?", answer: "The lions' den" },
  { text: "What did Jesus use to feed 5,000 people?", answer: "Five loaves and two fishes" },
  { text: "What did Jesus give the disciples before he was put to death?", answer: "Bread and wine" },
  { text: "What was Saul's name changed to after he was blinded?", answer: "Paul" },
  { text: "What were Daniel's three friends' names?", answer: "Shadrach, Meshach, and Abednego" },
  { text: "What were the names of Noah's three sons?", answer: "Shem, Ham, and Japheth" },
  { text: "What were Abraham and Sarah's original names?", answer: "Abram and Sarai" },
  { text: "In what city did God make the walls fall so that the Israelites could enter?", answer: "Jericho" },
  { text: "Name some of the Ten Commandments." },
  { text: "Name some of the plagues." },
  {
    text: "Name some of the fruit of the spirit.",
    answer: "Love, joy, peace, patience, kindness, goodness, faithfulness, gentleness, and self-control",
  },
  { text: "What gave Samson his strength?", answer: "His hair" },
  { text: "What town were Jesus and his family from?", answer: "Nazareth" },
  { text: "What were Abraham's sons' names?", answer: "Isaac and Ishmael" },
  { text: "What were Isaac's sons' names?", answer: "Jacob and Esau" },
  { text: "What did King Solomon build for God?", answer: "A temple" },
  { text: "How many of each animal went on Noah's Ark?", answer: "Two" },
  { text: "What part of Adam did God use to create Eve?", answer: "A rib" },
  { text: "How many days of rain fell during the story of Noah's Ark?", answer: "Forty" },
  { text: "Who was the man who betrayed Jesus?", answer: "Judas Iscariot" },
  { text: "What did God use to speak to Moses when he was in the desert?", answer: "A burning bush" },
  { text: "What land did God promise to Abraham?", answer: "Israel" },
  { text: "How many plagues did God send upon Egypt?", answer: "Ten" },
  { text: "Why did God scatter his people?", answer: "Because they didn't obey Him" },
  { text: "What did Naaman have to do to be healed?", answer: "Wash in the river Jordan seven times" },
  { text: "What did Nehemiah always do first before he started working?", answer: "He prayed to God" },
  { text: "How long did Jesus teach the people?", answer: "About 3.5 years" },
  { text: "What will happen when Jesus Christ returns to earth?", answer: "He will set up the kingdom" },
  {
    text: "What do we have to do if we want to be in the kingdom?",
    answer: "We have to believe God and obey Him",
  },
  { text: "What was Jezebel eaten by?", answer: "Dogs" },
  { text: "Who was the fat man that Ehud killed?", answer: "Eglon, king of Moab" },
];

const ASHER = [
  { text: "What animal spoke to Eve in the Garden of Eden?", answer: "A snake" },
  { text: "What did Adam and Eve eat?", answer: "Fruit" },
  { text: "What was the name of the giant killed by David?", answer: "Goliath" },
  { text: "What were the names of the first two people in the Bible?", answer: "Adam and Eve" },
  { text: "What is the name of the place where Adam and Eve first lived?", answer: "The Garden of Eden" },
  { text: "What sign did God give Noah that he'd never flood the earth again?", answer: "A rainbow in the sky" },
  { text: "Where is God?", answer: "In Heaven" },
  { text: "Who is God's son?", answer: "Jesus" },
];

export const FAMILY_QUESTIONS = [...GENERAL, ...ASHER].map((q) => ({ ...q, assignedTo: null }));
