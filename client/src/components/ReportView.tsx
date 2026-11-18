import type { ClassReport } from '../types';

export default function ReportView({ report }: { report: ClassReport }) {
  const maxDist = Math.max(1, ...report.distribution.map((item) => item.count));

  return (
    <div>
      <div className="report-metrics">
        <div className="metric">
          <span>班级人数</span>
          <strong>{report.totalStudents}</strong>
        </div>
        <div className="metric">
          <span>提交率</span>
          <strong>{report.submissionRate}%</strong>
        </div>
        <div className="metric">
          <span>已批阅</span>
          <strong>{report.gradedCount}</strong>
        </div>
        <div className="metric">
          <span>平均分</span>
          <strong>{report.averageScore || '—'}</strong>
        </div>
      </div>

      <div className="report-chart">
        <div>
          <div className="section-title">
            <h2>成绩分布</h2>
            <span className="muted small-text">按已批阅分数统计</span>
          </div>
          {report.distribution.map((item) => (
            <div className="distribution-row" key={item.label}>
              <span className="dist-label">{item.label}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(item.count / maxDist) * 100}%` }} />
              </div>
              <span className="dist-value">{item.count}人</span>
            </div>
          ))}
        </div>

        <div>
          <div className="section-title">
            <h2>评价维度平均分</h2>
            <span className="muted small-text">来自自动分析</span>
          </div>
          {report.dimensions.length === 0 && <p className="muted small-text">暂无分析数据</p>}
          {report.dimensions.map((dim) => (
            <div className="bar-row" key={dim.name}>
              <span className="bar-label">{dim.name}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.min(100, dim.average)}%` }} />
              </div>
              <span className="bar-value">{dim.average}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="report-chart" style={{ marginTop: 22 }}>
        <div>
          <div className="section-title">
            <h2>共性亮点</h2>
          </div>
          {report.topStrengths.length === 0 ? (
            <p className="muted small-text">暂无统计数据</p>
          ) : (
            <ul className="report-list">
              {report.topStrengths.map((item) => (
                <li key={item.text}>
                  {item.text}（{item.count}人）
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="section-title">
            <h2>共性改进点</h2>
          </div>
          {report.topImprovements.length === 0 ? (
            <p className="muted small-text">暂无统计数据</p>
          ) : (
            <ul className="report-list">
              {report.topImprovements.map((item) => (
                <li key={item.text}>
                  {item.text}（{item.count}人）
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th>学生</th>
              <th>提交状态</th>
              <th>教师评分</th>
              <th>自动分析建议分</th>
              <th>批阅状态</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            {report.students.map((student) => (
              <tr key={student.studentId}>
                <td>
                  {student.displayName}
                  <span className="muted small-text">（{student.username}）</span>
                </td>
                <td>
                  <StatusKind submitted={student.submitted} />
                </td>
                <td>{student.score ?? '—'}</td>
                <td>{student.suggestedScore ?? '—'}</td>
                <td>{student.graded ? '已批阅' : student.submitted ? '待批阅' : '—'}</td>
                <td className="muted small-text">{student.updatedAt ? student.updatedAt.slice(0, 16).replace('T', ' ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusKind({ submitted }: { submitted: boolean }) {
  return submitted ? <span className="status-badge submitted">已提交</span> : <span className="status-badge pending">未提交</span>;
}
