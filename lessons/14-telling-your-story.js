// Lesson 14: Telling your story
// Format and field reference: CONTRIBUTING.md
window.LESSONS.push({
  id: "story",
  n: 14,
  track: "Craft",
  mins: 30,
  title: "Telling your story",
  tag: "Technical rounds get you to maybe. This gets you to yes.",
  hook: "The technical rounds get you to 'maybe'. The behavioral round gets you to 'yes'. At senior level they're checking one thing: <mark>would I trust this person with an ambiguous, important problem?</mark> You answer that with stories, and you've got good ones.",
  steps: [
    {
      k: "read",
      t: "What senior behavioral rounds measure",
      b: "<ul><li><b>Scope and impact</b>: did the work matter beyond your ticket?</li><li><b>Ambiguity</b>: what did you do when nobody knew the answer?</li><li><b>Influence</b>: changing minds without authority.</li><li><b>Ownership</b>: incidents, mistakes, follow-through.</li><li><b>Growing others</b>: mentoring, raising the bar.</li><li><b>Judgment</b>: trade-offs, saying no, knowing when 'good enough' is right.</li></ul>"
    },
    {
      k: "read",
      t: "STAR, tightened",
      b: "<b>S</b>ituation: 2 sentences of context. <b>T</b>ask: your specific responsibility. <b>A</b>ction: <mark>about 70% of the answer, in 'I' language</mark>: what you decided, why, and what you said to whom. <b>R</b>esult: numbers, outcomes, and what you learned or would change.<br><br>The most common failure is 2 minutes of situation and 20 seconds of action. Aim for 2–3 minutes total."
    },
    {
      k: "order",
      q: "Put a strong STAR answer in order.",
      items: [
        "Context in two sentences: team, system, stakes",
        "Your specific responsibility and what made it hard",
        "What you did and why, including the trade-offs you weighed",
        "Outcome with numbers",
        "What you learned / would do differently"
      ],
      why: "Ending on the lesson learned shows self-awareness, and it's often what the interviewer writes down."
    },
    {
      k: "read",
      t: "Build a story bank",
      b: "Prepare 6–8 stories you can bend toward many questions. Go through these prompts and write one line from your own career for each:",
      table: {
        head: ["Story prompt", "Answers questions about"],
        rows: [
          ["Something you helped build or scale from an early stage", "Scaling, ambiguity, building from scratch"],
          ["A time you led people, formally or not", "Leadership, mentoring, delegation, conflict"],
          ["A legacy system you rewrote, migrated, or untangled", "Technical judgment, risk, migrations, influence"],
          ["A design or abstraction you're proud of (and its trade-offs)", "Architecture, judgment"],
          ["An integration or dependency that broke in production", "Reliability, incidents, ownership"],
          ["A feature where correctness really mattered (money, data, security)", "Rigor, cross-team work"],
          ["Something you started without being asked (tooling, process, AI workflows)", "Initiative, leverage, staying current"]
        ]
      },
      note: "For each one, write down a number (time saved, customers onboarded, incidents reduced, PR cycle time) and one thing that went wrong. Stories with friction are more believable."
    },
    {
      k: "mcq",
      q: "Which 'Result' is strongest?",
      o: [
        "It went well and everyone was happy",
        "We shipped it",
        "We cut the nightly job from 40 to 6 minutes, which let finance close a day earlier. Next time I'd add the monitoring before the rewrite, not after",
        "The team learned a lot"
      ],
      a: 2,
      why: "Specific, quantified, tied to business impact, and it ends with a self-aware lesson."
    },
    {
      k: "read",
      t: "The questions you will get",
      b: "<ul><li><b>Tell me about yourself</b>: 90 seconds, present → past → why this role. Not a CV recital.</li><li>A conflict with a colleague or manager.</li><li>A failure or a production incident you caused.</li><li>A decision made with incomplete information.</li><li>Pushing back on a product or technical direction.</li><li>The project you're proudest of.</li><li><b>Why are you looking?</b> Keep it forward-looking and positive.</li></ul>"
    },
    {
      k: "mcq",
      q: "Your company just had layoffs and the mood is uncertain. Best answer to 'Why are you looking?'",
      o: [
        "Complain about leadership",
        "Say you're not really looking",
        "'There's been some reorganization, and it made me think about what I want next: [specific thing this role offers]. That's why this role caught my attention.'",
        "Talk mostly about salary"
      ],
      a: 2,
      why: "Honest, brief, no bitterness, and it pivots to what you're moving toward. Interviewers want to hear what pulls you to them, not what pushes you away."
    },
    {
      k: "myth",
      q: "In behavioral answers, say 'we' throughout to show you're a team player.",
      a: false,
      why: "Credit the team for context and results, but the Action has to be 'I'. The interviewer is hiring you and needs to know what you specifically did and decided."
    },
    {
      k: "read",
      t: "Questions to ask them",
      b: "Good questions show judgment and help you decide:<ul><li>'What would make someone in this role clearly successful after six months?'</li><li>'What's the hardest technical problem the team is facing right now?'</li><li>'How are technical decisions made and written down?'</li><li>'How does on-call work, and what was the last major incident like?'</li><li>'What changed on the team in the past year?' (a gentle way to ask about stability)</li></ul>"
    }
  ],
  interview: {
    q: "Tell me about a time you had to make an important technical decision with incomplete information.",
    rubric: [
      "Clear, brief situation with real stakes",
      "Specific about their own role and the uncertainty involved",
      "Explains how they reduced uncertainty (spikes, data, asking experts) and the options weighed",
      "Made the call with reversibility in mind (two-way vs one-way door), communicated it",
      "Concrete result, ideally quantified",
      "Reflection: what they learned or would change; uses 'I' for actions"
    ],
    model: "<p><b>S:</b> 'At a fast-growing hotel platform, we had to decide whether to keep extending our booking engine or rebuild the pricing piece, with a big partner launch six weeks out.'</p><p><b>T:</b> 'As tech lead, I owned the recommendation.'</p><p><b>A:</b> 'We didn't know how pricing load would grow. I ran a one-week spike with production traces to estimate it, listed options with their reversibility, and chose to isolate pricing behind an interface so we could swap it later. That was a two-way door. I wrote it up and got buy-in from product by showing the launch risk of each option.'</p><p><b>R:</b> 'We launched on time; three months later we swapped the implementation in two weeks without touching callers.' <b>Learned:</b> 'Separate the reversible decisions from the irreversible ones early.' (Use your real numbers.)</p>"
  },
  cards: [
    ["How much of a STAR answer should be Action?", "~70%, in 'I' language."],
    ["Tell me about yourself: structure", "90 seconds: present → past → why this role."],
    ["Strong Result has…", "A number, business impact, and a lesson learned."],
    [
      "Answering 'why are you looking' after layoffs",
      "Brief, no bitterness, pivot to what draws you to this role."
    ],
    ["How many stories in a story bank?", "6–8, each adaptable to several questions."],
    [
      "Two-way door decision",
      "Reversible: decide fast. One-way door: slow down and gather data."
    ]
  ],
  cheat: [
    "Senior = trusted with ambiguous, important problems.",
    "STAR with ~70% Action, 'I' for actions, numbers in Results.",
    "6–8 stories, each with a number and some friction.",
    "Why looking: forward-looking, brief, positive.",
    "Ask questions that help you decide too."
  ]
});
