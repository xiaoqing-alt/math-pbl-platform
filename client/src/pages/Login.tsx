import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, getUser, roleHome, saveAuth } from '../api';
import type { Role, User } from '../types';

interface LoginResponse {
  token: string;
  user: User;
}

function useRegistrationEnabled() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    api<{ registrationEnabled: boolean }>('/auth/config', { auth: false })
      .then((cfg) => {
        if (mounted) setEnabled(Boolean(cfg && cfg.registrationEnabled));
      })
      .catch(() => {
        if (mounted) setEnabled(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  return enabled;
}

export default function Login() {
  const params = useParams();
  const role = (params.role === 'student' ? 'student' : 'teacher') as Role;
  const navigate = useNavigate();
  const existing = getUser();
  const registrationEnabled = useRegistrationEnabled();

  const [username, setUsername] = useState(role === 'teacher' ? 'teacher' : 'student');
  const [password, setPassword] = useState('123456');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  if (existing) {
    return <Navigate to={roleHome(existing.role)} replace />;
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        auth: false,
        body: { role, username: username.trim(), password },
      });
      saveAuth(result.token, result.user);
      navigate(roleHome(result.user.role));
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api<LoginResponse>('/auth/register', {
        method: 'POST',
        auth: false,
        body: { role: 'teacher', username: username.trim(), password, displayName, inviteCode: inviteCode.trim() },
      });
      saveAuth(result.token, result.user);
      navigate('/teacher');
    } catch (err: any) {
      setError(err.message || '注册失败');
    } finally {
      setLoading(false);
    }
  }

  // 注册入口仅在后端配置了邀请码时才展示，避免引导用户进入注定失败的流程
  const canShowRegister = role === 'teacher' && registrationEnabled === true;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link className="brand auth-brand" to="/">
          <span className="brand-mark">π</span>
          <span className="brand-text">
            <strong>数创工坊</strong>
            <small>初中数学 · 项目式学习平台</small>
          </span>
        </Link>

        <div className="auth-tabs">
          <Link className={`auth-tab${role === 'teacher' ? ' active' : ''}`} to="/login/teacher">
            教师端
          </Link>
          <Link className={`auth-tab${role === 'student' ? ' active' : ''}`} to="/login/student">
            学生端
          </Link>
        </div>

        <h2>{showRegister && canShowRegister ? '注册教师账号' : role === 'teacher' ? '教师登录' : '学生登录'}</h2>
        <p className="auth-sub">
          {role === 'teacher'
            ? '管理班级、编辑任务单、发布项目并批阅学生成果'
            : '查看教师发布的任务单，在线完成并提交成果'}
        </p>

        <form onSubmit={showRegister && canShowRegister ? handleRegister : handleLogin} className="auth-form">
          <label className="field">
            <span>用户名</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
            />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 位"
              autoComplete="current-password"
            />
          </label>
          {showRegister && canShowRegister && (
            <>
              <label className="field">
                <span>姓名</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="例如：李老师"
                />
              </label>
              <label className="field">
                <span>教师邀请码</span>
                <input
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder="向平台管理员索取"
                />
              </label>
            </>
          )}

          {error && <div className="alert error">{error}</div>}

          <button className="primary-btn full" type="submit" disabled={loading}>
            {loading ? '处理中…' : showRegister && canShowRegister ? '注册并进入' : '登录'}
          </button>
        </form>

        <div className="demo-hint">
          <span>演示账号</span>
          {role === 'teacher' ? (
            <button
              type="button"
              className="demo-fill"
              onClick={() => {
                setUsername('teacher');
                setPassword('123456');
              }}
            >
              teacher / 123456
            </button>
          ) : (
            <button
              type="button"
              className="demo-fill"
              onClick={() => {
                setUsername('student');
                setPassword('123456');
              }}
            >
              student / 123456
            </button>
          )}
        </div>

        {canShowRegister && (
          <button type="button" className="text-btn" onClick={() => setShowRegister(!showRegister)}>
            {showRegister ? '已有账号，返回登录' : '没有账号？注册教师账号'}
          </button>
        )}
        {role === 'student' && <div className="auth-note">学生账号由教师在班级管理中创建</div>}
      </div>
    </div>
  );
}
