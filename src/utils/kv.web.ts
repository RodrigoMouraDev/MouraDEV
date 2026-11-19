/** Web: armazenamento local do navegador (só guarda o nome do usuário no modo local). */
export const getItemAsync = async (k: string) => localStorage.getItem(k);
export const setItemAsync = async (k: string, v: string) => localStorage.setItem(k, v);
export const deleteItemAsync = async (k: string) => localStorage.removeItem(k);
