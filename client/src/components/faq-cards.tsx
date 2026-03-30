import React, { useState } from "react";

type FaqItem = {
  category?: string;
  question: string;
  answer: string;
};

type FaqCardsProps = {
  items?: FaqItem[];
  embedded?: boolean;
};

const defaultFaqs: FaqItem[] = [
  {
    category: "Career",
    question:
      "Why do STEM students face education loan anxiety from unclear costs in 2026?",
    answer:
      "STEM students often face loan anxiety due to unpredictable tuition, hidden fees, and lack of transparent cost breakdowns from institutions. This uncertainty makes it difficult to plan finances, leading to increased stress about loan amounts and repayment.",
  },
  {
    category: "Admissions",
    question:
      "How can I improve my chances of getting into a top STEM program?",
    answer:
      "Focus on strong academic performance, relevant extracurriculars, research experience, and compelling personal statements tailored to each program.",
  },
];

const FaqCards: React.FC<FaqCardsProps> = ({
  items = defaultFaqs,
  embedded = false,
}) => {
  const [current, setCurrent] = useState(0);
  const faqs = items.length > 0 ? items : defaultFaqs;
  const currentFaq = faqs[current] ?? faqs[0];
  const containerClassName = embedded
    ? "flex flex-col items-center justify-center"
    : "flex flex-col items-center justify-center min-h-screen bg-black";

  const handlePrev = () => {
    setCurrent((prev) => (prev === 0 ? faqs.length - 1 : prev - 1));
  };
  const handleNext = () => {
    setCurrent((prev) => (prev === faqs.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className={containerClassName}>
      {/* Layered card background */}
      <div className="relative flex items-center justify-center mb-8">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute w-80 h-96 rounded-3xl"
            style={{
              background: `hsl(${(i * 30) % 360}, 60%, 60%)`,
              transform: `rotate(${i * 15}deg) scale(1.05)`,
              zIndex: 0,
              opacity: 0.15,
            }}
          />
        ))}
        {/* Main card */}
        <div className="relative z-10 w-80 h-96 bg-white rounded-3xl flex flex-col items-center justify-center shadow-2xl p-6">
          <span className="bg-gray-200 text-gray-700 px-4 py-1 rounded-full text-sm mb-4 self-start">
            {currentFaq.category ?? `FAQ ${current + 1}`}
          </span>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4 text-left">
            {currentFaq.question}
          </h2>
          <p className="text-gray-700 text-base mt-auto text-left">
            {currentFaq.answer}
          </p>
        </div>
      </div>
      {/* Navigation */}
      <div className="flex items-center gap-8">
        <button
          onClick={handlePrev}
          className="text-white text-2xl px-4 py-2 rounded-full hover:bg-gray-800 transition"
          aria-label="Previous FAQ"
        >
          &#60;
        </button>
        <span className="text-white text-lg">Swipe</span>
        <button
          onClick={handleNext}
          className="text-white text-2xl px-4 py-2 rounded-full hover:bg-gray-800 transition"
          aria-label="Next FAQ"
        >
          &#62;
        </button>
      </div>
    </div>
  );
};

export default FaqCards;
