import { useState, useEffect } from 'react';
import { useTheme } from '../context.jsx';
import { Icon, Button } from '../components.jsx';
import { callAI } from '../aiClient.js';
import { generateQuizPrompt, parseQuizResponse } from '../utils/quizGenerator.js';

export function QuizModal({ book, pageTexts, lang, apiKeys, onClose, initialQuiz }) {
  const { T, F } = useTheme();
  const [quizType, setQuizType] = useState('multiple'); // 'multiple' | 'shortAnswer'
  const [quiz, setQuiz] = useState(initialQuiz || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userAnswer, setUserAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(null);

  const fetchQuiz = async () => {
    if (!apiKeys?.claude && !apiKeys?.gemini) {
      setError(lang === 'ko' ? 'AI 키를 설정해주세요' : 'Set API key first');
      return;
    }
    setLoading(true);
    setError('');
    setQuiz(null);
    setUserAnswer('');
    setSubmitted(false);
    setSelectedIdx(null);
    try {
      const isMultiple = quizType === 'multiple';
      const prompt = generateQuizPrompt(lang, book, pageTexts, isMultiple);

      const systemMsg = lang === 'ko'
        ? '당신은 교육용 퀴즈 전문가입니다. 유효한 JSON만 출력하세요.'
        : 'You are a quiz expert. Return ONLY valid JSON.';

      const result = await callAI(apiKeys, systemMsg, [], prompt);

      if (!result) {
        setError(lang === 'ko' ? 'AI 응답이 없습니다' : 'No AI response');
        return;
      }

      const parsed = parseQuizResponse(result);

      if (parsed && parsed.question) {
        // Validate parsed quiz
        if (isMultiple) {
          if (!Array.isArray(parsed.options) || parsed.options.length !== 5 || typeof parsed.correctIndex !== 'number') {
            setError(lang === 'ko' ? '퀴즈 형식이 올바르지 않습니다' : 'Invalid quiz format');
            return;
          }
        } else {
          if (!parsed.correctAnswer || typeof parsed.correctAnswer !== 'string') {
            setError(lang === 'ko' ? '정답 형식이 올바르지 않습니다' : 'Invalid answer format');
            return;
          }
        }
        setQuiz(parsed);
      } else {
        setError(lang === 'ko' ? '퀴즈를 생성할 수 없습니다. 다시 시도해주세요.' : 'Failed to generate quiz. Please try again.');
      }
    } catch (e) {
      setError(lang === 'ko' ? `오류: ${e.message}` : `Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const checkAnswer = () => {
    if (!quiz) return;
    if (quizType === 'multiple') {
      const correct = selectedIdx === quiz.correctIndex;
      setIsCorrect(correct);
    } else {
      const correct = userAnswer?.toLowerCase?.().trim() === quiz.correctAnswer?.toLowerCase?.().trim();
      setIsCorrect(correct);
    }
    setSubmitted(true);
  };

  if (!quiz) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}>
        <div style={{
          background: T.surface, borderRadius: 16, padding: 24,
          width: '100%', maxWidth: 400,
          border: `1px solid ${T.border}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, fontFamily: F.body }}>
              {lang === 'ko' ? '📝 퀴즈 생성' : '📝 Generate Quiz'}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <Icon name="x" size={20} color={T.inkMid} />
            </button>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.inkMid, marginBottom: 8, fontFamily: F.body }}>
              {lang === 'ko' ? '문제 유형' : 'Question Type'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['multiple', 'shortAnswer'].map(t => (
                <button
                  key={t}
                  onClick={() => setQuizType(t)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8,
                    border: `1px solid ${quizType === t ? T.accent : T.border}`,
                    background: quizType === t ? T.accentSoft : 'transparent',
                    color: quizType === t ? T.accent : T.inkMid,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    fontFamily: F.body,
                  }}
                >
                  {t === 'multiple' ? (lang === 'ko' ? '5지선다' : 'Multiple Choice') : (lang === 'ko' ? '단답형' : 'Short Answer')}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#d32f2f', marginBottom: 12, fontFamily: F.body }}>
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={fetchQuiz}
            disabled={loading}
            style={{
              width: '100%', padding: '12px', borderRadius: 10,
              border: 'none',
              background: loading ? T.border : T.accent,
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              fontFamily: F.body,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? `${lang === 'ko' ? '생성 중...' : 'Generating...'}` : `${lang === 'ko' ? '문제 생성하기' : 'Generate Question'}`}
          </button>
        </div>
      </div>
    );
  }

  // Show quiz
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
      padding: 20,
    }}>
      <div style={{
        background: T.surface, borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 500,
        border: `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, fontFamily: F.body }}>
            {lang === 'ko' ? '📝 퀴즈' : '📝 Quiz'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <Icon name="x" size={20} color={T.inkMid} />
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 14, fontFamily: F.body }}>
            {quiz.question}
          </div>

          {quizType === 'multiple' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {quiz.options?.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => !submitted && setSelectedIdx(i)}
                  disabled={submitted}
                  style={{
                    padding: '12px', borderRadius: 8,
                    border: `2px solid ${selectedIdx === i ? T.accent : T.border}`,
                    background: selectedIdx === i ? T.accentSoft : 'transparent',
                    color: selectedIdx === i ? T.accent : T.ink,
                    fontSize: 13, textAlign: 'left', cursor: submitted ? 'default' : 'pointer',
                    fontFamily: F.body,
                    transition: 'all .2s',
                  }}
                >
                  <span style={{ marginRight: 8 }}>
                    {String.fromCharCode(65 + i)}.
                  </span>
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => !submitted && setUserAnswer(e.target.value)}
              disabled={submitted}
              placeholder={lang === 'ko' ? '답을 입력하세요' : 'Type your answer'}
              style={{
                width: '100%', padding: '12px', borderRadius: 8,
                border: `1px solid ${T.border}`, background: T.surfaceAlt,
                color: T.ink, fontSize: 13, fontFamily: F.body,
                outline: 'none',
              }}
            />
          )}
        </div>

        {!submitted ? (
          <button
            onClick={checkAnswer}
            disabled={quizType === 'multiple' ? selectedIdx === null : !userAnswer?.trim()}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none',
              background: (quizType === 'multiple' ? selectedIdx === null : !userAnswer?.trim()) ? T.border : T.accent,
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: (quizType === 'multiple' ? selectedIdx === null : !userAnswer?.trim()) ? 'default' : 'pointer',
              fontFamily: F.body,
              opacity: (quizType === 'multiple' ? selectedIdx === null : !userAnswer?.trim()) ? 0.5 : 1,
            }}
          >
            {lang === 'ko' ? '제출' : 'Submit'}
          </button>
        ) : (
          <>
            <div style={{
              padding: 12, borderRadius: 10, marginBottom: 12,
              background: isCorrect ? '#4CAF5030' : '#F4433630',
              border: `1px solid ${isCorrect ? '#4CAF50' : '#F44336'}`,
              fontSize: 13, fontWeight: 600,
              color: isCorrect ? '#2E7D32' : '#C62828',
              fontFamily: F.body,
              textAlign: 'center',
            }}>
              {isCorrect ? `✓ ${lang === 'ko' ? '정답입니다!' : 'Correct!'}` : `✗ ${lang === 'ko' ? '틀렸습니다' : 'Incorrect'}`}
            </div>
            <div style={{
              padding: 12, borderRadius: 10, marginBottom: 12,
              background: T.surfaceAlt, border: `1px solid ${T.border}`,
              fontSize: 12, lineHeight: 1.6, color: T.ink, fontFamily: F.body,
            }}>
              {quiz.explanation}
            </div>
            <button
              onClick={() => { setQuiz(null); setUserAnswer(''); setSelectedIdx(null); }}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                background: T.accent, color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: F.body,
              }}
            >
              {lang === 'ko' ? '다음 문제' : 'Next Question'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
