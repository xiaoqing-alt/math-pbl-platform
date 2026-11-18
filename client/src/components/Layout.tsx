import { Link, NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { clearAuth, getUser, roleHome } from '../api';
import type { Role } from '../types';

const NAV: Record<Role, { to: string; label: string; end?: boolean }[]> = {
  teacher: [
    { to: '/teacher', label: '工作台', end: true },
    { to: '/teacher/classes', label: '班级管理' },
    { to: '/teacher/templates', label: '官方模板库' },
    { to: '/teacher/tools', label: '交互探究工具库' },
    { to: '/teacher/tasks', label: '我的任务单' },
  ],
  student: [{ to: '/student', label: '学习中心', end: true }],
};

export default function Layout({ role, children }: { role: Role; children: ReactNode }) {
  const navigate = useNavigate();
  const user = getUser();

  const logout = () => {
    clearAuth();
    navigate(`/login/${role}`);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to={roleHome(role)}>
          <span className="brand-mark">π</span>
          <span className="brand-text">
            <strong>数创工坊</strong>
            <small>初中数学 · 项目式学习平台</small>
          </span>
        </Link>

        <nav className="nav">
          {NAV[role].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="user-area">
          <span className={`role-chip ${role}`}>{role === 'teacher' ? '教师端' : '学生端'}</span>
          <span className="user-name">{user?.displayName || ''}</span>
          <button className="ghost-btn small" type="button" onClick={logout}>
            退出
          </button>
        </div>
      </header>

      <main className="main">{children}</main>

      <footer className="footer">
        <span>数创工坊 · 面向初中数学的项目式学习平台</span>
        <span>数与代数 / 图形与几何 / 统计与概率</span>
      </footer>
    </div>
  );
}
