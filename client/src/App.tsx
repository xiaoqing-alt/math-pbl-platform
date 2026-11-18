import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import Layout from './components/Layout';
import { getUser, roleHome } from './api';
import type { Role } from './types';
import Landing from './pages/Landing';
import Login from './pages/Login';
import TeacherDashboard from './pages/teacher/Dashboard';
import Classes from './pages/teacher/Classes';
import ClassDetail from './pages/teacher/ClassDetail';
import Templates from './pages/teacher/Templates';
import Tasks from './pages/teacher/Tasks';
import TaskEditor from './pages/teacher/TaskEditor';
import Grading from './pages/teacher/Grading';
import ToolLibrary from './pages/teacher/ToolLibrary';
import StudentHome from './pages/student/Home';
import StudentTask from './pages/student/TaskWorkspace';

function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const user = getUser();
  if (!user) return <Navigate to={`/login/${role}`} replace />;
  if (user.role !== role) return <Navigate to={roleHome(user.role)} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login/:role" element={<Login />} />

      <Route
        path="/teacher"
        element={
          <Guard role="teacher">
            <Layout role="teacher">
              <Outlet />
            </Layout>
          </Guard>
        }
      >
        <Route index element={<TeacherDashboard />} />
        <Route path="classes" element={<Classes />} />
        <Route path="classes/:id" element={<ClassDetail />} />
        <Route path="templates" element={<Templates />} />
        <Route path="tools" element={<ToolLibrary />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="tasks/:id" element={<TaskEditor />} />
        <Route path="assignments/:id" element={<Grading />} />
      </Route>

      <Route
        path="/student"
        element={
          <Guard role="student">
            <Layout role="student">
              <Outlet />
            </Layout>
          </Guard>
        }
      >
        <Route index element={<StudentHome />} />
        <Route path="tasks/:id" element={<StudentTask />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
