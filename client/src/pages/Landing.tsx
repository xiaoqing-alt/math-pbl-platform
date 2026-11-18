import { Link } from 'react-router-dom';

const BOARDS = [
  { tone: 'algebra', icon: 'ƒ', name: '数与代数', desc: '在真实情境中建立方程、函数与模型' },
  { tone: 'geometry', icon: '△', name: '图形与几何', desc: '测量、作图、推理，发现图形中的规律' },
  { tone: 'stats', icon: '▦', name: '统计与概率', desc: '用数据说话，从样本中读出信息' },
];

export default function Landing() {
  return (
    <div className="landing">
      <div className="landing-inner">
        <header className="landing-top">
          <div className="brand">
            <span className="brand-mark">π</span>
            <span className="brand-text">
              <strong>数创工坊</strong>
              <small>初中数学 · 项目式学习平台</small>
            </span>
          </div>
          <div className="landing-links">
            <Link className="ghost-btn" to="/login/teacher">
              教师登录
            </Link>
            <Link className="primary-btn" to="/login/student">
              学生登录
            </Link>
          </div>
        </header>

        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">大创原型 · 项目式学习</span>
            <h1>
              让数学项目<br />
              <span className="hero-accent">真实发生</span>
            </h1>
            <p>
              围绕数与代数、图形与几何、统计与概率三大板块，把官方优质任务单变成教师可编辑、可发布、可批阅的完整教学流程。
            </p>
            <div className="hero-actions">
              <Link className="primary-btn large" to="/login/teacher">
                进入教师端
              </Link>
              <Link className="outline-btn large" to="/login/student">
                进入学生端
              </Link>
            </div>
            <div className="hero-tags">
              <span>模板复制</span>
              <span>任务单编辑</span>
              <span>班级发布</span>
              <span>在线提交</span>
              <span>自动分析</span>
            </div>
          </div>
          <div className="hero-board">
            <div className="floating-card card-main">
              <div className="task-line">校园节水方案设计</div>
              <div className="mini-bars">
                <span style={{ height: '55%' }} />
                <span style={{ height: '78%' }} />
                <span style={{ height: '42%' }} />
                <span style={{ height: '90%' }} />
                <span style={{ height: '66%' }} />
              </div>
              <div className="mini-caption">一次函数 · 数据 · 建议书</div>
            </div>
            <div className="floating-card card-side">
              <div className="mini-title">AI 辅助</div>
              <div className="mini-pill">建模思路拆解</div>
              <div className="mini-pill">数据估算</div>
              <div className="mini-pill">结论表达</div>
            </div>
            <div className="floating-card card-bottom">
              <div className="score-ring">88</div>
              <div>
                <div className="mini-title">批阅反馈</div>
                <div className="mini-caption">数据完整 · 模型正确</div>
              </div>
            </div>
          </div>
        </section>

        <section className="board-strip">
          {BOARDS.map((board) => (
            <div key={board.tone} className={`board-card ${board.tone}`}>
              <span className="board-icon">{board.icon}</span>
              <div>
                <h3>{board.name}</h3>
                <p>{board.desc}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="flow-strip">
          <div className="flow-title">项目式学习的完整闭环</div>
          <div className="flow-steps">
            <div>
              <strong>01</strong>
              <span>复制官方模板，生成自己的任务单副本</span>
            </div>
            <div>
              <strong>02</strong>
              <span>按班级学情编辑目标、步骤与评价标准</span>
            </div>
            <div>
              <strong>03</strong>
              <span>发布到班级，学生在线完成并提交成果</span>
            </div>
            <div>
              <strong>04</strong>
              <span>在线批阅，自动生成班级学习分析</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
