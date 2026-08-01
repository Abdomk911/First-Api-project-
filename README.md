# Users & Posts app — how it works, and the pattern to reuse forever

This isn't just a recap of your code. It's the checklist to run through **every single time** you connect a UI to an API, on any future project.

---

## 1\. The big picture

   loadUsers()                    loadPosts(userId)

  ┌─────────────┐                ┌─────────────┐

  │ fetch users │                │ fetch posts │

  │   from API  │                │  for 1 user │

  └──────┬──────┘                └──────┬──────┘

         │                              │

         ▼                              ▼

  build a \<div\> card              build a \<div\> per post

  for each user                   with title \+ body

         │                              │

         ▼                              ▼

  append all to \#usersList        append all to \#content

         │

         ▼

  attach click listener

  on each card  ───────────────►  calls loadPosts(user.id)

Two independent functions. `loadUsers` runs once, on page load. `loadPosts` runs every time a card is clicked. They never call each other except through that one click event — that's the whole architecture.

---

## 2\. The universal shape of "fetch data and show it"

Every API-driven function you will ever write follows this exact skeleton. Memorize this shape, not the JSONPlaceholder specifics.

async function loadSomething() {

  const container \= document.getElementById('...');   // 1\. where it goes

  try {

    const response \= await fetch(URL);                 // 2\. ask for data

    if (\!response.ok) throw new Error(\`Status ${response.status}\`); // 3\. check it actually worked

    const data \= await response.json();                // 4\. parse it

    // 5\. turn data into DOM elements and insert them

    data.forEach(item \=\> { ... });

  } catch (error) {                                     // 6\. handle failure

    container.textContent \= 'Failed to load.';

    console.error(error);

  }

}

 ┌──────────┐   ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌─────────┐

 │  fetch   │──▶│  check   │──▶│  parse    │──▶│  build   │──▶│ insert  │

 │  (async) │   │ response │   │  .json()  │   │   DOM    │   │ once    │

 └──────────┘   │   .ok    │   └───────────┘   └──────────┘   └─────────┘

       │        └──────────┘

       ▼ (network failure)

  catch block → show fallback message, log the real error

**Why every part exists:**

| Step | Why it's there |
| :---- | :---- |
| `async function` | Lets you use `await` inside. Doesn't make anything run in parallel — it just guarantees the function returns a promise. |
| `await fetch(URL)` | Pauses this function until the network request finishes, without blocking the rest of the page. |
| `if (!response.ok)` | `fetch` only rejects on *network* failure. A 404 or 500 still "succeeds" as far as `fetch` is concerned — you have to check the status yourself. |
| `await response.json()` | The response body arrives as raw text first; this parses it into a usable array/object. |
| `try/catch` | Catches network failures and your own `throw` from step 3, in one place. |
| `container.textContent = 'Failed...'` | Never leave the user staring at a silently blank screen. Always show *something* went wrong. |

---

## 3\. Building DOM elements safely — the pattern you used

const card \= document.createElement('div');       // 1\. create empty element

card.className \= 'bg-gray-700 rounded p-3';        // 2\. style it

card.textContent \= user.name;                      // 3\. put text in it — SAFE

container.appendChild(card);                       // 4\. attach to the page

**Why `textContent`, never `innerHTML`, for API data:**

innerHTML \= api\_data     →  browser PARSES it as HTML

                             a malicious \<img onerror="..."\> would EXECUTE

textContent \= api\_data   →  browser treats it as plain text, always

                             nothing can ever execute

JSONPlaceholder is safe test data, but this has to be a reflex, not a judgment call you make per-project. Always `textContent` (or `createElement`) for anything that came from outside your own code.

**Why build everything before touching the real page (`DocumentFragment`):**

 WITHOUT fragment                    WITH fragment

 ─────────────────                   ──────────────

 appendChild(card1) → reflow \#1      build card1 ─┐

 appendChild(card2) → reflow \#2      build card2 ─┼─ in memory, invisible

 appendChild(card3) → reflow \#3      build card3 ─┘

 ...10 users \= 10 reflows            appendChild(fragment) → reflow \#1 (only one)

A `div` wrapper works too and is simpler to reason about — the only downside is it leaves one extra empty `<div>` sitting in your HTML forever. Fragment disappears completely on append; only its children land in the real DOM.

---

## 4\. Connecting a click to "which one was clicked"

This is the part that trips people up most, so here's the full chain.

 1\. Store the id ON the element while building it:

      card.dataset.userId \= user.id

      → renders as \<div data-user-id="7"\>...\</div\>

 2\. Attach a listener INSIDE the loop (per card),

    so each one keeps its own reference:

      card.addEventListener('click', () \=\> { ... })

 3\. Inside the handler, read it back:

      card.dataset.userId          → "7"   (always a STRING)

    or, if using the event object:

      e.target.dataset.userId      → "7"

`dataset` maps `data-user-id` → `dataset.userId` automatically — dashes in HTML become camelCase in JS. That's the entire rule, no exceptions.

**The "select one card" logic, generalized:**

allCards.forEach(c \=\> {

  c.classList.remove('border-orange-500');   // 1\. reset EVERYONE first

  c.classList.add('border-transparent');

});

clickedCard.classList.remove('border-transparent');  // 2\. THEN highlight

clickedCard.classList.add('border-orange-500');       // only the one clicked

Always reset-then-select, in that order — never just add to the clicked one, or highlights stack up on every card you've ever clicked.

---

## 5\. The reusable checklist — run this on every future API project

\[ \] What's the URL? Does it need a query param (?userId=7)?

\[ \] async function wrapping the whole thing

\[ \] await fetch(url)

\[ \] if (\!response.ok) throw ...

\[ \] await response.json()

\[ \] try/catch around all of the above

\[ \] Loop through the data with forEach

\[ \] createElement \+ textContent for each piece of data (never innerHTML)

\[ \] Attach any click listeners INSIDE the loop, per item

\[ \] Store the item's id with element.dataset if you'll need it later

\[ \] Build everything, THEN append once to the real DOM

\[ \] Show a fallback message in the catch block — never fail silently

That's it — that's the entire mental model behind every "fetch data, show it on a page" feature you'll ever build, whether it's users and posts, products and reviews, or repos and commits.  
