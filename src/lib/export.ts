import jsPDF from 'jspdf';
import { StudyKit } from './search';

export const exportAsMarkdown = (kit: StudyKit): void => {
  let markdown = `# ${kit.subject}\n\n`;
  markdown += `*Generated on ${kit.timestamp}*\n\n`;

  if (kit.outputModes.summary) {
    markdown += `## 📖 Summary\n${kit.outputModes.summary}\n\n`;
  }

  if (kit.outputModes.flashcards && kit.outputModes.flashcards.length > 0) {
    markdown += `## ⚡ Flashcards\n`;
    kit.outputModes.flashcards.forEach((card, i) => {
      markdown += `**Q${i + 1}:** ${card.question}\n`;
      markdown += `**A${i + 1}:** ${card.answer}\n\n`;
    });
  }

  if (kit.outputModes.quiz && kit.outputModes.quiz.length > 0) {
    markdown += `## 🎯 Quiz\n`;
    kit.outputModes.quiz.forEach((q, i) => {
      markdown += `**Q${i + 1}:** ${q.question}\n`;
      q.options.forEach((opt, j) => {
        const isCorrect = opt === q.correctAnswer;
        markdown += `- ${opt} ${isCorrect ? '✅' : ''}\n`;
      });
      markdown += `*Explanation:* ${q.explanation}\n\n`;
    });
  }

  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${kit.subject.replace(/\s+/g, '_')}_StudyKit.md`;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportAsPdf = (kit: StudyKit): void => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 20;

  const addText = (text: string, size = 12, isBold = false, color = '#000000') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setTextColor(color);
    
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
    
    if (y + lines.length * (size / 2) > 280) {
      doc.addPage();
      y = 20;
    }
    
    doc.text(lines, margin, y);
    y += lines.length * (size / 2) + 5;
  };

  // Title
  addText(kit.subject, 22, true, '#7c3aed');
  addText(`Generated on ${kit.timestamp}`, 10, false, '#666666');
  y += 10;

  if (kit.outputModes.summary) {
    addText('Summary', 16, true, '#7c3aed');
    addText(kit.outputModes.summary, 12);
    y += 10;
  }

  if (kit.outputModes.flashcards && kit.outputModes.flashcards.length > 0) {
    addText('Flashcards', 16, true, '#7c3aed');
    kit.outputModes.flashcards.forEach((card, i) => {
      addText(`Q${i + 1}: ${card.question}`, 12, true);
      addText(`A${i + 1}: ${card.answer}`, 12);
      y += 5;
    });
    y += 10;
  }

  if (kit.outputModes.quiz && kit.outputModes.quiz.length > 0) {
    addText('Quiz', 16, true, '#7c3aed');
    kit.outputModes.quiz.forEach((q, i) => {
      addText(`Q${i + 1}: ${q.question}`, 12, true);
      q.options.forEach((opt) => {
        const isCorrect = opt === q.correctAnswer;
        addText(`- ${opt} ${isCorrect ? '(Correct)' : ''}`, 12);
      });
      addText(`Explanation: ${q.explanation}`, 10, false, '#666666');
      y += 5;
    });
  }

  doc.save(`${kit.subject.replace(/\s+/g, '_')}_StudyKit.pdf`);
};
