<script>
  export let size = 50;
  export let timeText = '00:00';
  export let dateText = '01.01';
</script>

<svg width={size} height={size} viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
  <!-- Background gear icon - bigger and properly centered -->
  <g transform="translate(25,25) scale(2.2)" opacity="0.3">
    <path d="M0,7.5A1.5,1.5 0 0,1 -1.5,6A1.5,1.5 0 0,1 0,4.5A1.5,1.5 0 0,1 1.5,6A1.5,1.5 0 0,1 0,7.5M7.43,0.97C7.47,-0.35 7.5,-0.67 7.5,-1C7.5,-1.33 7.47,-1.66 7.43,-2L9.54,-3.63C9.73,-3.78 9.78,-4.05 9.66,-4.27L7.66,-7.73C7.54,-7.95 7.27,-8.04 7.05,-7.95L4.56,-6.95C4.04,-7.34 3.5,-7.68 2.87,-7.93L2.5,-10.58C2.46,-10.82 2.25,-11 2,-11H-2C-2.25,-11 -2.46,-10.82 -2.5,-10.58L-2.87,-7.93C-3.5,-7.68 -4.04,-7.34 -4.56,-6.95L-7.05,-7.95C-7.27,-8.04 -7.54,-7.95 -7.66,-7.73L-9.66,-4.27C-9.78,-4.05 -9.73,-3.78 -9.54,-3.63L-7.43,-2C-7.47,-1.66 -7.5,-1.33 -7.5,-1C-7.5,-0.67 -7.47,-0.35 -7.43,0.97L-9.54,2.63C-9.73,2.78 -9.78,3.05 -9.66,3.27L-7.66,6.73C-7.54,6.95 -7.27,7.03 -7.05,6.95L-4.56,5.94C-4.04,6.34 -3.5,6.68 -2.87,6.93L-2.5,9.58C-2.46,9.82 -2.25,10 -2,10H2C2.25,10 2.46,9.82 2.5,9.58L2.87,6.93C3.5,6.68 4.04,6.34 4.56,5.94L7.05,6.95C7.27,7.03 7.54,6.95 7.66,6.73L9.66,3.27C9.78,3.05 9.73,2.78 9.54,2.63L7.43,0.97Z" fill="#999"/>
  </g>
  <!-- Time text on top line -->
  <text x="25" y="20" font-family="Arial, sans-serif" font-size="11" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="#666">{timeText}</text>
  <!-- Date text on bottom line -->
  <text x="25" y="32" font-family="Arial, sans-serif" font-size="9" font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="#777">{dateText}</text>
</svg>