# MCF reader feature support

The reader consumes the current normalized `mcf-npm` 1.0/1.1 model.

| Area             | Support                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Packages         | Course, standalone module, standalone lesson                                                                        |
| Content          | CommonMark/GFM, tables, blockquotes, links, code, local/declared assets, safe SVG, audio, video, KaTeX              |
| Activities       | Notes, practice, assessments, assignments                                                                           |
| Questions        | Multiple choice/select, true/false, short answer, numeric tolerance/units, matching, ordering, essay, open response |
| Evaluation       | Automatic, manual, completion, ungraded                                                                             |
| Scoring          | Exact, weighted choice, partial select/matching/ordering, required questions, pass thresholds                       |
| Continuity       | Responses, attempts, location, assessment results, completion, deterministic pools and orders                       |
| Completion       | Viewed, attempted, answered, submitted, passed, manually marked; nested `all`/`any` to depth eight                  |
| Feedback         | Selected-option feedback, hints, explanations, automatic-result messages                                            |
| Manual work      | Saved as pending review; provisional automatic score only                                                           |
| Visual authoring | Course/module/lesson metadata, structure, activities, questions, assignments, rubrics, assets, and completion       |
| Source authoring | Every validated package kind and construct through source-preserving mode                                           |

Failed threshold assessments do not satisfy `passed`. Matching honors response-reuse rules.
Essay/open-response completion can enforce authored word, sentence, and keyword requirements.
Assignment text, URL, and file metadata can be submitted locally with declared count/type controls;
file bodies are not uploaded or retained.

Question-bank and asset-collection packages validate but do not open as standalone learner
experiences. Studio preserves and exports them but labels their initial visual editing as
source-only. Instructor grading, secure examination, prerequisites not represented by current
normalized completion data, synchronization, and LMS delivery are outside this stage. The current
normalized MCF model does not define a portable assessment attempt-limit field, so attempts are
counted and preserved but no non-standard limit is invented.
