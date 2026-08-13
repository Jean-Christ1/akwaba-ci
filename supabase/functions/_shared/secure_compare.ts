/**
 * Comparaison de secrets à durée constante.
 *
 * Une comparaison `===` sur une chaîne s'arrête au premier octet différent :
 * le temps de réponse renseigne alors l'appelant sur la longueur du préfixe
 * correct, ce qui rend un jeton devinable octet par octet.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);

  // La longueur reste observable, mais on parcourt toujours le même nombre
  // d'octets pour ne rien révéler du contenu lui-même.
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}
