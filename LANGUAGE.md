# Language

## ASD-STE100 Simplified Technical English

Write all text in [ASD-STE100 Simplified Technical English](https://www.asd-ste100.org/). These rules apply to all written text in all locations, for humans and for agents. Examples:

- Chat replies, plans, and summaries.
- Linear issues: titles, descriptions, acceptance criteria, and comments.
- GitHub text: PR titles, PR bodies, review comments, issue text, and release notes.
- Commit messages and changeset entries.
- Docs, READMEs, and Markdown files.
- Agent instructions, skills, and prompts for sub-agents.
- Slack messages and other messages.

These rules do not apply to code, code comments, code identifiers, or other descriptors in code. Those items have their own rules.

We do not use the STE dictionary of approved words. Use normal technical English and the real terms of our domain. All other STE rules apply.

## Words

- Give each word one meaning and one part of speech. For example, "test" is a noun or a verb, not both.
- Use the technical nouns and technical verbs of our domain. Define each domain term in the Domain Words section.
- Do not use a technical noun as a verb. Do not use a technical verb as a noun.
- Use one term for one thing. Do not use synonyms for variety.
- Choose a short term that people can understand.
- Do not use idioms, slang, metaphors, humor, or regional words.
- Write technical names, code identifiers, file paths, and command names as they are. Do not change them to satisfy these rules.
- Use American English spelling.

## Noun Phrases

- Use a maximum of three nouns in a row. For example, "order book snapshot cache key" has five nouns.
- To use a longer name, write it in full one time. Then use a shorter name or hyphens.

## Verbs

- Use only these verb forms: infinitive, imperative, simple present, simple past, and simple future.
- Use a past participle only as an adjective. For example, "the closed position".
- Do not use auxiliary verbs to make complex verb forms. For example, do not write "has been changed" or "should have been sent".
- Use an `-ing` form only in a technical noun. For example, "rate limiting".
- Use the active voice. Name the agent of each action.
- In descriptive text, use the passive voice only when the agent is not known.
- Use a verb for an action, not a noun. Write "check the value", not "do a check of the value".

## Sentences

- Write short, clear sentences.
- Do not remove words to make text shorter. Keep the subjects, the verbs, and the articles `a`, `an`, and `the`.
- Do not use contractions. Write "do not", not "don't".
- Use a vertical list for complex text.
- Use connecting words to link sentences about the same topic.
- Put an article or a demonstrative ("this", "that") before a noun when applicable.

## Procedures

- Use a maximum of 20 words in a sentence.
- Write one instruction in each sentence. The exception is two actions that occur at the same time.
- Write instructions in the imperative.
- If an instruction starts with a condition, put a comma after the condition. For example: "If the build fails, stop."
- Use notes to give information, not instructions.

## Descriptive Writing

- Use a maximum of 25 words in a sentence.
- Write about one topic in each paragraph.
- Start each paragraph with its topic sentence.
- Use a maximum of six sentences in a paragraph.
- Give information in steps, from general to specific.

## Safety Instructions

Use these rules for text about destructive commands, production deploys, data deletion, and other actions that you cannot reverse.

- Start with a signal word for the level of risk: WARNING or CAUTION.
- Start the instruction with a clear command or condition.
- Tell the reader the risk or the possible result.

## Punctuation and Word Count

- Use standard punctuation. Do not use semicolons.
- Use hyphens to join words that are directly related.
- You can use parentheses. Text in parentheses counts as one word.
- A hyphenated word counts as one word.

## Writing Practices

- If a word-for-word change does not work, write the sentence again with a different structure.
- Do not use phrasal verbs, such as "set up", "carry out", or "look into". Use one verb, such as "configure", "do", or "examine".
- Use the same style and the same words in all documents.
- Do not use Latin abbreviations. Write "for example", not "e.g.". Write "that is", not "i.e.".

## Domain Words

Use each word below with the given meaning only.

<<<< domain-specific words here >>>>
