export function RankTrustMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <g className="rank-mark-list">
        <circle cx="11" cy="14" r="2" />
        <path d="M17 14h17" />
        <circle cx="11" cy="23" r="2" />
        <path d="M17 23h12" />
        <circle cx="11" cy="32" r="2" />
        <path d="M17 32h7" />
      </g>
      <path className="rank-mark-check" d="m28.5 30.5 3.5 3.5 7-9" />
    </svg>
  );
}


export const rankMarkMask = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="6 8 36 30" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="14" r="2"/><circle cx="11" cy="23" r="2"/><circle cx="11" cy="32" r="2"/><path d="M17 14h17M17 23h12M17 32h7m4.5-1.5 3.5 3.5 7-9"/></svg>')}`;
