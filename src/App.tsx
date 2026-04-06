import React, { useState, useEffect, useRef } from "react";
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import OpenAI from "openai";
import ReactMarkdown from "react-markdown";
import { 
  BookOpen, 
  Settings, 
  PenTool, 
  Download, 
  Plus, 
  Trash2, 
  ChevronRight, 
  ChevronLeft, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  Save,
  FileText,
  Layout,
  Users,
  Target,
  Type as TypeIcon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "./lib/utils";

// --- Types ---

interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
}

interface BookConfig {
  title: string;
  genre: string;
  tone: string;
  audience: string;
  plotSummary: string;
  characters: Character[];
  chapterCount: number;
  wordsPerChapter: number;
}

interface Chapter {
  id: number;
  title: string;
  summary: string;
  content: string;
  status: "pending" | "generating" | "completed" | "error";
  error?: string;
}

interface Book {
  id: string;
  createdAt: number;
  updatedAt: number;
  config: BookConfig;
  chapters: Chapter[];
}

type View = "library" | "config" | "outline" | "writing" | "reading";

// --- Constants ---

const GENRES = [
  "Fantasy", "Science Fiction", "Mystery", "Thriller", "Romance", 
  "Historical Fiction", "Horror", "Non-Fiction", "Biography", "Self-Help"
];

const TONES = [
  "Dark", "Whimsical", "Serious", "Humorous", "Inspirational", 
  "Academic", "Poetic", "Cinematic", "Suspenseful"
];

const AUDIENCES = [
  "Children", "Young Adult", "Adult", "Academic", "Professional"
];

const INITIAL_CONFIG: BookConfig = {
  title: "",
  genre: "Fantasy",
  tone: "Serious",
  audience: "Adult",
  plotSummary: "",
  characters: [],
  chapterCount: 5,
  wordsPerChapter: 1000,
};

// --- App Component ---

export default function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [view, setView] = useState<View>("library");
  const [config, setConfig] = useState<BookConfig>(INITIAL_CONFIG);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [isGeneratingChapters, setIsGeneratingChapters] = useState(false);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, dangerouslyAllowBrowser: true }) : null;

  const generateAIContent = async (prompt: string, jsonMode: boolean = false) => {
    if (openai) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: jsonMode ? { type: "json_object" } : undefined,
      });
      return response.choices[0].message.content || "";
    } else {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: jsonMode ? { responseMimeType: "application/json" } : undefined
      });
      return response.text || "";
    }
  };

  // --- Persistence ---

  useEffect(() => {
    const savedBooks = localStorage.getItem("ai_books");
    if (savedBooks) {
      try {
        setBooks(JSON.parse(savedBooks));
      } catch (e) {
        console.error("Failed to parse saved books", e);
      }
    }
  }, []);

  useEffect(() => {
    if (books.length > 0) {
      localStorage.setItem("ai_books", JSON.stringify(books));
    }
  }, [books]);

  // Sync current book state to the books array
  useEffect(() => {
    if (selectedBookId) {
      setBooks(prev => prev.map(b => b.id === selectedBookId ? {
        ...b,
        config,
        chapters,
        updatedAt: Date.now()
      } : b));
    }
  }, [config, chapters, selectedBookId]);

  // --- Handlers ---

  const createNewBook = () => {
    const newBook: Book = {
      id: Math.random().toString(36).substr(2, 9),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      config: INITIAL_CONFIG,
      chapters: []
    };
    setBooks(prev => [newBook, ...prev]);
    selectBook(newBook);
  };

  const selectBook = (book: Book) => {
    setSelectedBookId(book.id);
    setConfig(book.config);
    setChapters(book.chapters);
    setView(book.chapters.length > 0 ? "writing" : "config");
  };

  const deleteBook = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this book?")) {
      setBooks(prev => prev.filter(b => b.id !== id));
      if (selectedBookId === id) {
        setSelectedBookId(null);
        setView("library");
      }
    }
  };

  const addCharacter = () => {
    const newChar: Character = {
      id: Math.random().toString(36).substr(2, 9),
      name: "",
      role: "",
      description: ""
    };
    setConfig(prev => ({ ...prev, characters: [...prev.characters, newChar] }));
  };

  const removeCharacter = (id: string) => {
    setConfig(prev => ({ ...prev, characters: prev.characters.filter(c => c.id !== id) }));
  };

  const updateCharacter = (id: string, field: keyof Character, value: string) => {
    setConfig(prev => ({
      ...prev,
      characters: prev.characters.map(c => c.id === id ? { ...c, [field]: value } : c)
    }));
  };

  const generateOutline = async () => {
    if (!config.title || !config.plotSummary) {
      setError("Please provide at least a title and a plot summary.");
      return;
    }

    setIsGeneratingOutline(true);
    setError(null);

    try {
      const prompt = `
        You are a professional book architect. Create a detailed outline for a book with the following configuration:
        Title: ${config.title}
        Genre: ${config.genre}
        Tone: ${config.tone}
        Audience: ${config.audience}
        Plot Summary: ${config.plotSummary}
        Characters: ${config.characters.map(c => `${c.name} (${c.role}): ${c.description}`).join("; ")}
        Number of Chapters: ${config.chapterCount}

        Return the outline as a JSON array of objects, where each object has "title" and "summary" (a 2-3 sentence summary of what happens in that chapter).
        Format: [{"title": "Chapter 1: ...", "summary": "..."}, ...]
      `;

      const text = await generateAIContent(prompt, true);
      const outline = JSON.parse(text || "[]");
      const newChapters: Chapter[] = outline.map((ch: any, index: number) => ({
        id: index + 1,
        title: ch.title,
        summary: ch.summary,
        content: "",
        status: "pending"
      }));

      setChapters(newChapters);
      setView("outline");
    } catch (err) {
      setError("Failed to generate outline. Please try again.");
      console.error(err);
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const generateChapter = async (index: number) => {
    const chapter = chapters[index];
    if (!chapter) return;

    setChapters(prev => prev.map((ch, i) => i === index ? { ...ch, status: "generating" } : ch));

    try {
      const previousChaptersContext = chapters
        .slice(0, index)
        .map(ch => `Chapter ${ch.id} Summary: ${ch.summary}`)
        .join("\n");

      const prompt = `
        You are a professional novelist. Write the full content for Chapter ${chapter.id} of the book "${config.title}".
        
        Book Context:
        Genre: ${config.genre}
        Tone: ${config.tone}
        Audience: ${config.audience}
        Overall Plot: ${config.plotSummary}
        Characters: ${config.characters.map(c => `${c.name} (${c.role}): ${c.description}`).join("; ")}
        
        Previous Chapters Context:
        ${previousChaptersContext}

        Current Chapter Details:
        Title: ${chapter.title}
        Summary: ${chapter.summary}
        Target Word Count: ${config.wordsPerChapter} words.

        Write in a compelling, immersive style appropriate for the genre and tone. 
        Focus on sensory details, character internal monologue, and dialogue.
        Do not include meta-commentary or chapter titles in the output, just the narrative content.
      `;

      const text = await generateAIContent(prompt);

      setChapters(prev => prev.map((ch, i) => i === index ? { 
        ...ch, 
        content: text || "", 
        status: "completed" 
      } : ch));
    } catch (err) {
      setChapters(prev => prev.map((ch, i) => i === index ? { 
        ...ch, 
        status: "error", 
        error: "Failed to generate content." 
      } : ch));
      console.error(err);
    }
  };

  const startWriting = async () => {
    setView("writing");
    setIsGeneratingChapters(true);
    
    // Generate chapters sequentially to maintain context
    for (let i = 0; i < chapters.length; i++) {
      setCurrentChapterIndex(i);
      await generateChapter(i);
    }
    
    setIsGeneratingChapters(false);
  };

  const downloadBook = () => {
    const fullText = chapters.map(ch => `# ${ch.title}\n\n${ch.content}`).join("\n\n---\n\n");
    const blob = new Blob([fullText], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.title || "Untitled Book"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Render Helpers ---

  const renderLibrary = () => (
    <div className="space-y-12 max-w-6xl mx-auto pb-20">
      <header className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-5xl font-serif italic font-light tracking-tight">Your Library</h1>
          <p className="text-zinc-500">Manage your collection of AI-architected masterpieces.</p>
        </div>
        <button 
          onClick={createNewBook}
          className="bg-white text-black px-8 py-3 rounded-full font-semibold flex items-center gap-2 hover:bg-zinc-200 transition-all group"
        >
          <Plus size={20} />
          Create New Book
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {books.map((book) => (
          <motion.div
            key={book.id}
            layoutId={book.id}
            onClick={() => selectBook(book)}
            className="group relative bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 h-80 flex flex-col justify-between cursor-pointer hover:border-zinc-600 transition-all hover:bg-zinc-900/60"
          >
            <button 
              onClick={(e) => deleteBook(book.id, e)}
              className="absolute top-4 right-4 p-2 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
            >
              <Trash2 size={16} />
            </button>

            <div className="space-y-4">
              <div className="w-10 h-12 bg-zinc-800 rounded flex items-center justify-center border border-zinc-700 group-hover:border-zinc-500 transition-colors">
                <BookOpen size={20} className="text-zinc-500 group-hover:text-zinc-300" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-serif italic line-clamp-2">{book.config.title || "Untitled Masterpiece"}</h3>
                <p className="text-xs text-zinc-500 uppercase tracking-widest">{book.config.genre}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                <span>{book.chapters.length} Chapters</span>
                <span>{new Date(book.updatedAt).toLocaleDateString()}</span>
              </div>
              <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                <div 
                  className="bg-white h-full transition-all duration-1000" 
                  style={{ width: `${(book.chapters.filter(c => c.status === "completed").length / (book.config.chapterCount || 1)) * 100}%` }} 
                />
              </div>
            </div>
          </motion.div>
        ))}

        {books.length === 0 && (
          <div 
            onClick={createNewBook}
            className="col-span-full py-32 border-2 border-dashed border-zinc-800 rounded-3xl flex flex-col items-center justify-center space-y-4 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400 transition-all cursor-pointer"
          >
            <Plus size={48} strokeWidth={1} />
            <p className="font-serif italic text-xl">Your library is empty. Start your first book.</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderConfig = () => (
    <div className="space-y-8 max-w-4xl mx-auto pb-20">
      <header className="space-y-2">
        <h1 className="text-4xl font-serif italic font-light tracking-tight">Book Architect</h1>
        <p className="text-muted-foreground">Configure your masterpiece. The AI will handle the heavy lifting.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest font-semibold opacity-50 flex items-center gap-2">
              <TypeIcon size={14} /> Book Title
            </label>
            <input 
              type="text" 
              placeholder="The Echoes of Silence..."
              className="w-full bg-transparent border-b border-zinc-800 py-2 focus:border-zinc-400 outline-none transition-colors text-xl font-serif"
              value={config.title}
              onChange={e => setConfig({ ...config, title: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest font-semibold opacity-50 flex items-center gap-2">
                <Layout size={14} /> Genre
              </label>
              <select 
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 outline-none focus:border-zinc-600"
                value={config.genre}
                onChange={e => setConfig({ ...config, genre: e.target.value })}
              >
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest font-semibold opacity-50 flex items-center gap-2">
                <Sparkles size={14} /> Tone
              </label>
              <select 
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 outline-none focus:border-zinc-600"
                value={config.tone}
                onChange={e => setConfig({ ...config, tone: e.target.value })}
              >
                {TONES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest font-semibold opacity-50 flex items-center gap-2">
              <Target size={14} /> Target Audience
            </label>
            <select 
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 outline-none focus:border-zinc-600"
              value={config.audience}
              onChange={e => setConfig({ ...config, audience: e.target.value })}
            >
              {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest font-semibold opacity-50">Chapters</label>
              <input 
                type="number" 
                min={1} 
                max={20}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 outline-none focus:border-zinc-600"
                value={config.chapterCount}
                onChange={e => setConfig({ ...config, chapterCount: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest font-semibold opacity-50">Words / Chapter</label>
              <input 
                type="number" 
                step={100}
                min={100}
                max={2000}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 outline-none focus:border-zinc-600"
                value={config.wordsPerChapter}
                onChange={e => setConfig({ ...config, wordsPerChapter: parseInt(e.target.value) || 100 })}
              />
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest font-semibold opacity-50 flex items-center gap-2">
              <FileText size={14} /> Plot Summary
            </label>
            <textarea 
              placeholder="A brief overview of the story arc..."
              className="w-full h-40 bg-zinc-900 border border-zinc-800 rounded-xl p-4 outline-none focus:border-zinc-600 resize-none font-serif leading-relaxed"
              value={config.plotSummary}
              onChange={e => setConfig({ ...config, plotSummary: e.target.value })}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-widest font-semibold opacity-50 flex items-center gap-2">
                <Users size={14} /> Characters
              </label>
              <button 
                onClick={addCharacter}
                className="text-xs flex items-center gap-1 hover:text-white transition-colors opacity-70 hover:opacity-100"
              >
                <Plus size={14} /> Add Character
              </button>
            </div>
            
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {config.characters.map((char) => (
                <div key={char.id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 space-y-2 relative group">
                  <button 
                    onClick={() => removeCharacter(char.id)}
                    className="absolute top-2 right-2 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                  <input 
                    type="text" 
                    placeholder="Name"
                    className="bg-transparent border-none outline-none w-full font-semibold"
                    value={char.name}
                    onChange={e => updateCharacter(char.id, "name", e.target.value)}
                  />
                  <input 
                    type="text" 
                    placeholder="Role (e.g. Protagonist)"
                    className="bg-transparent border-none outline-none w-full text-xs text-zinc-400"
                    value={char.role}
                    onChange={e => updateCharacter(char.id, "role", e.target.value)}
                  />
                  <textarea 
                    placeholder="Brief description..."
                    className="bg-transparent border-none outline-none w-full text-xs text-zinc-500 resize-none h-12"
                    value={char.description}
                    onChange={e => updateCharacter(char.id, "description", e.target.value)}
                  />
                </div>
              ))}
              {config.characters.length === 0 && (
                <p className="text-center text-zinc-600 text-xs py-4 italic">No characters added yet.</p>
              )}
            </div>
          </div>
        </section>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3 text-sm">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div className="flex justify-center pt-8">
        <button 
          onClick={generateOutline}
          disabled={isGeneratingOutline}
          className="bg-white text-black px-8 py-3 rounded-full font-semibold flex items-center gap-2 hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          {isGeneratingOutline ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Architecting Outline...
            </>
          ) : (
            <>
              Generate Outline
              <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </div>
    </div>
  );

  const renderOutline = () => (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <button 
            onClick={() => setView("config")}
            className="text-xs flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity mb-2"
          >
            <ChevronLeft size={14} /> Back to Config
          </button>
          <h1 className="text-3xl font-serif italic">Story Outline</h1>
          <p className="text-muted-foreground text-sm">Review and refine your chapter summaries before writing.</p>
        </div>
        <button 
          onClick={startWriting}
          className="bg-white text-black px-6 py-2 rounded-full font-semibold flex items-center gap-2 hover:bg-zinc-200 transition-all"
        >
          Start Writing
          <PenTool size={18} />
        </button>
      </header>

      <div className="space-y-4">
        {chapters.map((ch, idx) => (
          <motion.div 
            key={ch.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Chapter {ch.id}</span>
            </div>
            <input 
              className="w-full bg-transparent text-xl font-serif outline-none border-b border-transparent focus:border-zinc-700 py-1"
              value={ch.title}
              onChange={e => setChapters(prev => prev.map(c => c.id === ch.id ? { ...c, title: e.target.value } : c))}
            />
            <textarea 
              className="w-full bg-transparent text-zinc-400 text-sm outline-none resize-none h-20 leading-relaxed"
              value={ch.summary}
              onChange={e => setChapters(prev => prev.map(c => c.id === ch.id ? { ...c, summary: e.target.value } : c))}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );

  const renderWriting = () => (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <header className="flex items-center justify-between sticky top-0 bg-black/80 backdrop-blur-md py-4 z-10 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800">
            <Loader2 size={24} className={cn("text-white", isGeneratingChapters && "animate-spin")} />
          </div>
          <div>
            <h2 className="font-serif italic text-xl">Writing: {config.title}</h2>
            <p className="text-xs text-zinc-500">
              {isGeneratingChapters 
                ? `Generating Chapter ${currentChapterIndex + 1} of ${chapters.length}...` 
                : "Generation Complete"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isGeneratingChapters && (
            <button 
              onClick={downloadBook}
              className="bg-zinc-900 text-white px-4 py-2 rounded-full text-sm font-medium border border-zinc-800 flex items-center gap-2 hover:bg-zinc-800 transition-colors"
            >
              <Download size={16} /> Download
            </button>
          )}
          <button 
            onClick={() => setView("reading")}
            className="bg-white text-black px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 hover:bg-zinc-200 transition-colors"
          >
            <BookOpen size={16} /> Read Mode
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="lg:col-span-1 space-y-4 sticky top-24 h-fit">
          <h3 className="text-xs uppercase tracking-widest font-bold text-zinc-500">Chapters</h3>
          <div className="space-y-2">
            {chapters.map((ch, idx) => (
              <button 
                key={ch.id}
                onClick={() => setCurrentChapterIndex(idx)}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group",
                  currentChapterIndex === idx 
                    ? "bg-zinc-900 border-zinc-700 text-white" 
                    : "bg-transparent border-transparent text-zinc-500 hover:bg-zinc-900/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono opacity-50">{idx + 1}</span>
                  <span className="text-sm truncate max-w-[120px]">{ch.title}</span>
                </div>
                {ch.status === "completed" && <CheckCircle2 size={14} className="text-green-500" />}
                {ch.status === "generating" && <Loader2 size={14} className="animate-spin text-white" />}
                {ch.status === "error" && <AlertCircle size={14} className="text-red-500" />}
              </button>
            ))}
          </div>
        </aside>

        <main className="lg:col-span-3 space-y-8 min-h-[600px] bg-zinc-900/30 border border-zinc-800 rounded-3xl p-8 lg:p-12">
          <AnimatePresence mode="wait">
            <motion.div 
              key={currentChapterIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-4">
                <h1 className="text-4xl font-serif italic">{chapters[currentChapterIndex]?.title}</h1>
                <div className="h-px w-20 bg-zinc-700" />
              </div>

              {chapters[currentChapterIndex]?.status === "generating" && (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <Loader2 size={48} className="animate-spin text-zinc-700" />
                  <p className="text-zinc-500 animate-pulse font-serif italic">Weaving the narrative threads...</p>
                </div>
              )}

              {chapters[currentChapterIndex]?.content ? (
                <div className="prose prose-invert prose-zinc max-w-none font-serif leading-relaxed text-lg text-zinc-300">
                  <ReactMarkdown>{chapters[currentChapterIndex].content}</ReactMarkdown>
                </div>
              ) : chapters[currentChapterIndex]?.status !== "generating" && (
                <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
                  <PenTool size={48} className="text-zinc-800" />
                  <p className="text-zinc-600 italic">This chapter is waiting to be written.</p>
                  <button 
                    onClick={() => generateChapter(currentChapterIndex)}
                    className="text-xs text-zinc-400 hover:text-white underline underline-offset-4"
                  >
                    Generate this chapter now
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );

  const renderReading = () => (
    <div className="max-w-3xl mx-auto space-y-16 py-20 px-6">
      <header className="text-center space-y-6 pb-20 border-b border-zinc-800">
        <button 
          onClick={() => setView("writing")}
          className="text-xs opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1 mx-auto"
        >
          <ChevronLeft size={14} /> Back to Editor
        </button>
        <h1 className="text-6xl font-serif italic tracking-tight">{config.title}</h1>
        <div className="flex items-center justify-center gap-4 text-zinc-500 text-sm uppercase tracking-widest">
          <span>{config.genre}</span>
          <span>•</span>
          <span>{chapters.length} Chapters</span>
        </div>
      </header>

      <div className="space-y-24">
        {chapters.map((ch) => (
          <section key={ch.id} className="space-y-12">
            <div className="text-center space-y-4">
              <span className="text-xs font-mono text-zinc-600 uppercase tracking-[0.3em]">Chapter {ch.id}</span>
              <h2 className="text-3xl font-serif italic">{ch.title}</h2>
            </div>
            <div className="prose prose-invert prose-zinc max-w-none font-serif text-xl leading-loose text-zinc-300 first-letter:text-5xl first-letter:font-bold first-letter:mr-3 first-letter:float-left">
              <ReactMarkdown>{ch.content}</ReactMarkdown>
            </div>
            <div className="flex justify-center pt-12">
              <div className="h-px w-12 bg-zinc-800" />
            </div>
          </section>
        ))}
      </div>

      <footer className="pt-20 text-center space-y-8">
        <p className="text-zinc-500 italic font-serif">The End</p>
        <div className="flex items-center justify-center gap-4">
          <button 
            onClick={downloadBook}
            className="bg-white text-black px-8 py-3 rounded-full font-semibold flex items-center gap-2 hover:bg-zinc-200 transition-all"
          >
            <Download size={20} /> Download Manuscript
          </button>
        </div>
      </footer>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-white selection:text-black">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-zinc-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-zinc-900/20 rounded-full blur-[120px]" />
      </div>

      <nav className="fixed top-0 left-0 right-0 h-16 border-b border-zinc-800/50 bg-black/50 backdrop-blur-xl z-50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <PenTool size={18} className="text-black" />
          </div>
          <span className="font-serif italic text-lg tracking-tight">Architect</span>
        </div>
        
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setView("library")}
            className={cn("text-xs uppercase tracking-widest font-bold transition-colors", view === "library" ? "text-white" : "text-zinc-500 hover:text-zinc-300")}
          >
            Library
          </button>
          <button 
            disabled={!selectedBookId}
            onClick={() => setView("config")}
            className={cn("text-xs uppercase tracking-widest font-bold transition-colors", view === "config" ? "text-white" : "text-zinc-500 hover:text-zinc-300 disabled:opacity-30")}
          >
            Configure
          </button>
          <button 
            disabled={chapters.length === 0}
            onClick={() => setView("outline")}
            className={cn("text-xs uppercase tracking-widest font-bold transition-colors", view === "outline" ? "text-white" : "text-zinc-500 hover:text-zinc-300 disabled:opacity-30")}
          >
            Outline
          </button>
          <button 
            disabled={chapters.length === 0}
            onClick={() => setView("writing")}
            className={cn("text-xs uppercase tracking-widest font-bold transition-colors", view === "writing" ? "text-white" : "text-zinc-500 hover:text-zinc-300 disabled:opacity-30")}
          >
            Writing
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-widest bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", openai ? "bg-blue-500" : "bg-green-500")} />
            {openai ? "OpenAI Engine Active" : "Gemini Engine Active"}
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-32 px-6 min-h-screen">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {view === "library" && renderLibrary()}
            {view === "config" && renderConfig()}
            {view === "outline" && renderOutline()}
            {view === "writing" && renderWriting()}
            {view === "reading" && renderReading()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Custom Scrollbar Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3f3f46;
        }
      `}} />
    </div>
  );
}
