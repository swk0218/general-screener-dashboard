import { ChevronRight } from 'lucide-react';

export function UpdateBadge({date}) {
  const session=typeof date==='string'?date.slice(0,10):null;
  return <time className="update-badge" dateTime={session||undefined} title={session?`자료 기준일 ${session}`:'자료 없음'}>{session?`${session.slice(5).replace('-','.')} Updated`:'자료 없음'}</time>;
}

export function SectionFooter({onClick,children}) {
  return <footer className="section-footer"><button type="button" onClick={onClick}>{children}<ChevronRight size={16} aria-hidden="true"/></button></footer>;
}
