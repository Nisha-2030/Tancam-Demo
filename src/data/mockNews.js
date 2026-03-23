export const mockNews = [
  {
    id: "n1",
    title: "ISRO launches reusable satellite mission for climate tracking",
    category: "Science",
    source: "PIB",
    trustScore: 100,
    note: "ISRO launched a reusable climate mission, boosting Earth observation and strengthening India-focused science updates for exam preparation.",
    staticGk: [
      { label: "Founded", value: "1969" },
      { label: "Headquarters", value: "Bengaluru" },
      { label: "Chairman", value: "V. Narayanan (current as mock context)" }
    ],
    quiz: {
      question: "ISRO headquarters is located in which city?",
      options: ["Hyderabad", "Bengaluru", "Pune", "Ahmedabad"],
      correctAnswer: "Bengaluru",
      explanation: "ISRO operates from Bengaluru, Karnataka."
    }
  },
  {
    id: "n2",
    title: "Government announces G20 Skill Accelerator Scheme for youth",
    category: "Schemes",
    source: "The Hindu + Indian Express",
    trustScore: 80,
    note: "A new G20-linked skill scheme targets employability and certification support for young job seekers across priority sectors.",
    staticGk: [
      { label: "G20 Members", value: "19 countries + EU + AU" },
      { label: "India Presidency Year", value: "2023" },
      { label: "Theme", value: "Vasudhaiva Kutumbakam" }
    ],
    quiz: {
      question: "India held the G20 presidency in which year?",
      options: ["2021", "2022", "2023", "2024"],
      correctAnswer: "2023",
      explanation: "India's G20 presidency was held in 2023."
    }
  },
  {
    id: "n3",
    title: "Indian ecologist wins Global River Restoration Award",
    category: "Awards",
    source: "PIB",
    trustScore: 100,
    note: "An Indian ecologist received an international restoration award, important for environment and award-focused current affairs questions.",
    quiz: {
      question: "This item belongs to which exam-relevant category?",
      options: ["Crime", "Awards", "Politics", "Entertainment"],
      correctAnswer: "Awards",
      explanation: "International recognitions are commonly covered under Awards."
    }
  },
  {
    id: "n4",
    title: "Major political rally held in Delhi ahead of civic polls",
    category: "Politics",
    source: "TV panel recap",
    trustScore: 60,
    note: "Primarily political event coverage; low exam relevance for SSC, RRB, and Banking objective current affairs modules.",
    quiz: {
      question: "Why is this item usually filtered out?",
      options: [
        "It is policy-neutral political coverage",
        "It is from PIB only",
        "It is a science update",
        "It is a national award"
      ],
      correctAnswer: "It is policy-neutral political coverage",
      explanation: "General political rally coverage is commonly deprioritized in objective exam filtering."
    }
  },
  {
    id: "n5",
    title: "Action film crosses record box office collection in opening week",
    category: "Entertainment",
    source: "Entertainment portal",
    trustScore: 60,
    note: "Entertainment milestones are usually removed during exam-oriented filtering due to low utility in objective sections.",
    quiz: {
      question: "Which category does this belong to?",
      options: ["Schemes", "Science", "Entertainment", "Appointments"],
      correctAnswer: "Entertainment",
      explanation: "The news is about a film collection milestone."
    }
  },
  {
    id: "n6",
    title: "RBI starts SecurePay awareness campaign for digital fraud prevention",
    category: "Schemes",
    source: "RBI bulletin + Business Standard",
    trustScore: 80,
    note: "RBI's awareness campaign highlights digital safety, useful for banking awareness and regulatory current affairs sections.",
    staticGk: [
      { label: "RBI Established", value: "1935" },
      { label: "RBI Nationalised", value: "1949" },
      { label: "RBI Headquarters", value: "Mumbai" }
    ],
    quiz: {
      question: "RBI headquarters is in:",
      options: ["Mumbai", "Delhi", "Kolkata", "Chennai"],
      correctAnswer: "Mumbai",
      explanation: "The Reserve Bank of India is headquartered in Mumbai."
    }
  },
  {
    id: "n7",
    title: "City crime statistics report rise in theft cases",
    category: "Crime",
    source: "Local bulletin",
    trustScore: 60,
    note: "Routine crime trend reporting is usually filtered out from exam-specific current affairs content.",
    quiz: {
      question: "This item is generally marked as:",
      options: ["High exam relevance", "Irrelevant", "PIB verified", "Award update"],
      correctAnswer: "Irrelevant",
      explanation: "Crime trend reports are generally low-priority for this exam workflow."
    }
  },
  {
    id: "n8",
    title: "Regional institute claims innovation award from unverified portal",
    category: "Awards",
    source: "Single blog source",
    trustScore: 60,
    note: "Award category is relevant, but low source confidence leads to rejection in trust-based verification.",
    quiz: {
      question: "Why does this item move to Reject status?",
      options: [
        "Category is not Awards",
        "Trust score is only 60%",
        "PIB directly verified it",
        "It has three source confirmations"
      ],
      correctAnswer: "Trust score is only 60%",
      explanation: "Low-trust items are rejected even if category looks relevant."
    }
  }
];
