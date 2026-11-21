import type { Locale } from '../../i18n.js'
import gb from '../../assets/flags/gb.svg'
import fr from '../../assets/flags/fr.svg'
import de from '../../assets/flags/de.svg'
import es from '../../assets/flags/es.svg'
import it from '../../assets/flags/it.svg'
import nl from '../../assets/flags/nl.svg'
import pl from '../../assets/flags/pl.svg'
import ru from '../../assets/flags/ru.svg'
import tr from '../../assets/flags/tr.svg'

const flags: Record<Locale, string> = { en: gb, fr, de, es, it, nl, pl, ru, tr }

/** Decorative local artwork; the language control supplies its accessible name. */
export function LanguageFlag(props: { locale: Locale }) {
  return <img class="language-flag" src={flags[props.locale]} alt="" aria-hidden="true" width="24" height="16" />
}
